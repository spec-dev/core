import {
    logger,
    StringKeyMap,
    getEventVersionsInNsp,
    chainIdForContractNamespace,
    schemaForChainId,
    formatEventVersionViewName,
    getBlockEventsSeriesNumber,
    identPath,
    nowAsUTCDateString,
    sleep,
} from '../../../shared'
import { Pool } from 'pg'
import config from '../config'
import chalk from 'chalk'

async function resetContractGroupEventRecordCounts(fullContractGroup: string) {
    const t0 = performance.now()
    logger.info(chalk.cyanBright(`Starting resetContractGroupEventRecordCounts (${fullContractGroup})...`))

    // Get the chain id and schema associated with the contract group's namespace.
    const chainId = chainIdForContractNamespace(fullContractGroup)
    if (!chainId) {
        logger.error(chalk.redBright(`No chain id associated with namespace ${fullContractGroup}...`))
        return
    }
    const chainSchema = schemaForChainId[chainId]

    // Get all event versions in this contract group's namespace.
    const eventVersions = await getEventVersionsInNsp(fullContractGroup)
    if (!eventVersions?.length) {
        logger.error(chalk.redBright(`No event versions found in namespace ${fullContractGroup}...`))
        return
    }

    // Get the full paths of the Postgres views associated with these event versions.
    const viewPaths = eventVersions.map(ev => {
        if (!ev.version.startsWith('0x')) return null // ignore deprecated contract events with 0.0.1 versions
        const viewName = formatEventVersionViewName(ev)
        if (!viewName) {
            logger.error(chalk.redBright(`[${fullContractGroup}] No view name could be created from EventVersion(id=${ev.id})`))
            return null
        }
        return [chainSchema, viewName].join('.')
    }).filter(v => !!v)
    if (!viewPaths.length) return
    
    // Create connection pool.
    const pool = new Pool({
        host: config.SHARED_TABLES_DB_HOST,
        port: config.SHARED_TABLES_DB_PORT,
        user: config.SHARED_TABLES_DB_USERNAME,
        password: config.SHARED_TABLES_DB_PASSWORD,
        database: config.SHARED_TABLES_DB_NAME,
        max: config.SHARED_TABLES_MAX_POOL_SIZE,
        statement_timeout: 600000, // 10min
    })
    pool.on('error', err => logger.error('PG client error', err))

    // Upsert & pause each view entry in the record counts table.
    if (!(await upsertAndPauseRecordCounts(pool, viewPaths))) return 

    // Get the current block number using the event sorter series #.
    const initialBlockNumber = await getBlockEventsSeriesNumber(chainId)
    if (!initialBlockNumber) {
        logger.error(chalk.redBright(`[${fullContractGroup}] No series number found for chainId=${chainId}...`))
        await pool.end()
        return
    }

    // Delete record count deltas for these views below this block number.
    if (!(await deleteRecordCountDeltasBelowBlockNumber(pool, viewPaths, initialBlockNumber, chainId))) return

    // Get the exact record counts for each view below the current block number.
    const recordCounts = await Promise.all(viewPaths.map(
        viewPath => calculateRecordCountBelowBlockNumber(pool, viewPath, initialBlockNumber)
    ))
    for (const count of recordCounts) {
        if (count === null) {
            await pool.end()
            return
        }
    }

    // Get current block number again in case it changed.
    const latestBlockNumber = await getBlockEventsSeriesNumber(chainId)

    // If there was a reorg backwards, just start the job over...
    if (latestBlockNumber < initialBlockNumber) {
        logger.warn(chalk.yellow(`[${fullContractGroup}] Reorg detected mid record-count job. Restarting...`))
        await sleep(10000)
        await pool.end()
        return resetContractGroupEventRecordCounts(fullContractGroup)
    }

    // Fill in the count gaps due to the time it took to run the first calculation.
    if (latestBlockNumber > initialBlockNumber) {
        const gapCounts = await Promise.all(viewPaths.map(
            viewPath => calculateRecordCountBetweenBlockNumbers(pool, viewPath, initialBlockNumber, latestBlockNumber)
        ))
        for (let i = 0; i < gapCounts.length; i++) {
            const gapCount = gapCounts[i]
            if (gapCount === null) {
                await pool.end()
                return
            }
            recordCounts[i] += gapCount
        }
    }

    // Update record counts with new values and unpause.
    await upsertAndUnpauseRecordCounts(pool, viewPaths, recordCounts)
    await pool.end()

    const seconds = Number(((performance.now() - t0) / 1000).toFixed(2))
    logger.info(chalk.cyanBright(`DONE (${fullContractGroup}) in ${seconds}s`))
}

async function upsertAndPauseRecordCounts(pool: Pool, viewPaths: string[]): Promise<boolean> {
    const placeholders = []
    const bindings = []
    let i = 1
    for (const viewPath of viewPaths) {
        placeholders.push(`($${i}, $${i + 1})`)
        bindings.push(...[viewPath, true])
        i += 2
    }

    let success = true
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `INSERT INTO record_counts (table_path, paused) VALUES ${placeholders.join(', ')} ON CONFLICT (table_path) DO UPDATE SET paused = true`,
            bindings,
        )
        await client.query('COMMIT')
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(`Failed to upsert and pause record counts for view paths (${viewPaths.join(', ')}): ${err}`)
        success = false
    } finally {
        client.release()
    }

    return success
}

async function upsertAndUnpauseRecordCounts(
    pool: Pool, 
    viewPaths: string[],
    recordCounts: number[],
): Promise<boolean> {
    const placeholders = []
    const bindings = []
    let i = 1
    const now = nowAsUTCDateString()
    for (let j = 0; j < viewPaths.length; j++) {
        const viewPath = viewPaths[j]
        const recordCount = recordCounts[j]
        placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
        bindings.push(...[viewPath, recordCount, false, now])
        i += 4
    }

    let success = true
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `INSERT INTO record_counts (table_path, value, paused, updated_at) VALUES ${placeholders.join(', ')} ON CONFLICT (table_path) DO UPDATE SET value = excluded.value, paused = false, updated_at = excluded.updated_at`,
            bindings,
        )
        await client.query('COMMIT')
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(`Failed to upsert and unpause record counts for view paths (${viewPaths.join(', ')}): ${err}`)
        success = false
    } finally {
        client.release()
    }

    return success
}

async function calculateRecordCountBelowBlockNumber(
    pool: Pool,
    viewPath: string, 
    blockNumber: number,
): Promise<number | null> {
    const client = await pool.connect()
    let result
    try {
        result = await client.query(
            `SELECT count(*) FROM ${identPath(viewPath)} WHERE block_number <= $1`,
            [blockNumber],
        )
    } catch (err) {
        logger.error(
            `Failed to select count(*) from ${viewPath} where block_number <= ${blockNumber}: ${err}`
        )
    } finally {
        client.release()
    }
    if (!result) return null

    return Number((result.rows || [])[0]?.count || 0)
}

async function calculateRecordCountBetweenBlockNumbers(
    pool: Pool,
    viewPath: string, 
    fromBlockNumber: number,
    toBlockNumber: number,
): Promise<number | null> {
    const client = await pool.connect()
    let result
    try {
        result = await client.query(
            `SELECT count(*) FROM ${identPath(viewPath)} WHERE block_number > $1 and block_number <= $2`,
            [fromBlockNumber, toBlockNumber],
        )
    } catch (err) {
        logger.error(
            `Failed to select count(*) from ${viewPath} where block_number (${fromBlockNumber} -> ${toBlockNumber}): ${err}`
        )
    } finally {
        client.release()
    }
    if (!result) return null

    return Number((result.rows || [])[0]?.count || 0)
}

async function deleteRecordCountDeltasBelowBlockNumber(
    pool: Pool,
    viewPaths: string[],
    blockNumber: number,
    chainId: string,
): Promise<boolean> {
    const placeholders = []
    const bindings = []
    let i = 1
    for (const viewPath of viewPaths) {
        placeholders.push(`$${i}`)
        bindings.push(viewPath)
        i++
    }
    bindings.push(...[blockNumber, chainId])

    let success = true
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `DELETE FROM record_count_deltas WHERE table_path IN (${placeholders.join(', ')}) AND block_number <= $${i} AND chain_id = $${i + 1}`,
            bindings,
        )
        await client.query('COMMIT')
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(`Failed to delete record count deltas for view paths (${viewPaths.join(', ')}) <= block number ${blockNumber}: ${err}`)
        success = false
    } finally {
        client.release()
    }

    return success
}

export default function job(params: StringKeyMap) {
    return {
        perform: async () => resetContractGroupEventRecordCounts(params.fullContractGroup)
    }
}