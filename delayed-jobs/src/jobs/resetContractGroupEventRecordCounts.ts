import {
    logger,
    StringKeyMap,
    getEventVersionsInNsp,
    schemaForChainId,
    formatEventVersionViewName,
    getBlockEventsSeriesNumber,
    identPath,
    nowAsUTCDateString,
    sleep,
    ChainTables,
    getChainIdsForContractGroups,
    chainIds,
    camelizeKeys
} from '../../../shared'
import { Pool } from 'pg'
import config from '../config'
import chalk from 'chalk'
import { literal } from 'pg-format'

async function resetContractGroupEventRecordCounts(group: string) {
    const t0 = performance.now()
    logger.info(chalk.cyanBright(`Starting resetContractGroupEventRecordCounts (${group})...`))

    // Get all event versions in this contract group's namespace.
    const eventVersions = await getEventVersionsInNsp(group)
    if (!eventVersions?.length) {
        logger.warn(chalk.yellow(`No event versions found in namespace ${group}. Stopping.`))
        return
    }

    // Group chains.
    let chainIds = await getChainIdsForContractGroups([group])
    chainIds = (chainIds || []).sort()
    if (!chainIds.length) return

    // Get the full paths of the Postgres views associated with these event versions.
    const viewPaths = eventVersions.map(ev => {
        if (!ev.version.startsWith('0x')) return null // ignore deprecated contract events with 0.0.1 versions
        const viewName = formatEventVersionViewName(ev)
        if (!viewName) {
            logger.error(chalk.redBright(`[${group}] No view name could be created from EventVersion(id=${ev.id})`))
            return null
        }
        return ['spec', viewName].join('.')
    }).filter(v => !!v)
    if (!viewPaths.length) return
    
    // Upsert & pause each view entry in the record counts table.
    if (!(await upsertAndPauseRecordCounts(viewPaths))) return 
    
    const initialBlockNumbers = {}
    for (const chainId of chainIds) {
        // Get the current block number using the event sorter series #.
        const initialBlockNumber = await getBlockEventsSeriesNumber(chainId)
        if (!initialBlockNumber) {
            logger.error(chalk.redBright(`[${group}] No series number found for chainId=${chainId}...`))
            return
        }

        initialBlockNumbers[chainId] = initialBlockNumber

        // Delete record count deltas for these views below this block number.
        if (!(await deleteRecordCountDeltasBelowBlockNumber(viewPaths, initialBlockNumber, chainId))) return
    }

    // Get the exact record counts for each view below the current block number.
    const recordCounts = await Promise.all(viewPaths.map(
        viewPath => calculateRecordCountBelowBlockNumbers(viewPath, chainIds, initialBlockNumbers)
    ))
    for (const count of recordCounts) {
        if (count === null) {
            return
        }
    }

    const heads = {}
    for (const chainId of chainIds) {
        const initialBlockNumber = initialBlockNumbers[chainId]
        const latestBlockNumber = await getBlockEventsSeriesNumber(chainId)
        heads[chainId] = latestBlockNumber

        // If there was a reorg backwards, just start the job over...
        if (latestBlockNumber < initialBlockNumber) {
            logger.warn(chalk.yellow(`[${group}] Reorg detected mid record-count job. Restarting...`))
            await sleep(10000)
            return resetContractGroupEventRecordCounts(group)
        }

        // Fill in the count gaps due to the time it took to run the first calculation.
        if (latestBlockNumber > initialBlockNumber) {
            const gapCounts = await Promise.all(viewPaths.map(
                viewPath => calculateRecordCountBetweenBlockNumbers(chainId, viewPath, initialBlockNumber, latestBlockNumber)
            ))
            for (let i = 0; i < gapCounts.length; i++) {
                const gapCount = gapCounts[i]
                if (gapCount === null) {
                    return
                }
                recordCounts[i] += gapCount
            }
        }
    }

    const shortPool = new Pool({
        host: config.SHARED_TABLES_DB_HOST,
        port: config.SHARED_TABLES_DB_PORT,
        user: config.SHARED_TABLES_DB_USERNAME,
        password: config.SHARED_TABLES_DB_PASSWORD,
        database: config.SHARED_TABLES_DB_NAME,
        max: config.SHARED_TABLES_MAX_POOL_SIZE,
        statement_timeout: 30000,
    })
    shortPool.on('error', err => logger.error('PG client error', err))

    // Update record counts with new values and unpause.
    await upsertAndUnpauseRecordCounts(shortPool, viewPaths, recordCounts, heads)
    await shortPool.end()

    const seconds = Number(((performance.now() - t0) / 1000).toFixed(2))
    logger.info(chalk.cyanBright(`DONE (${group}) in ${seconds}s`))
}

async function upsertAndPauseRecordCounts(viewPaths: string[]): Promise<boolean> {
    const placeholders = []
    const bindings = []
    let i = 1
    for (const viewPath of viewPaths) {
        placeholders.push(`($${i}, $${i + 1})`)
        bindings.push(...[viewPath, true])
        i += 2
    }

    let success = true
    const client = await ChainTables.getConnection(null)
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
    heads: StringKeyMap,
): Promise<boolean> {
    const placeholders = []
    const bindings = []
    let i = 1

    const timestamps = await Promise.all(
        viewPaths.map(viewPath => getLatestBlockTimestampForView(viewPath, heads))
    )
    const now = nowAsUTCDateString()
    for (let j = 0; j < viewPaths.length; j++) {
        const viewPath = viewPaths[j]
        const recordCount = recordCounts[j]
        const timestamp = timestamps[j] || now
        placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
        bindings.push(...[viewPath, recordCount, false, timestamp])
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
async function calculateRecordCountBelowBlockNumbers(
    viewPath: string, 
    chainIds: string[],
    blockNumbers: StringKeyMap,
): Promise<number | null> {
    let count = 0
    const viewName = viewPath.split('.').pop()
    for (const chainId of chainIds) {
        const schema = schemaForChainId[chainId]
        const blockNumber = blockNumbers[chainId]
        const chainViewPath = [schema, viewName].join('.')

        const client = await ChainTables.getConnection(schema)
        let result
        try {
            result = await client.query(
                `SELECT count(*) FROM ${identPath(chainViewPath)} WHERE block_number <= $1`,
                [blockNumber],
            )
        } catch (err) {
            logger.error(
                `Failed to select count(*) from ${chainViewPath} where block_number <= ${blockNumber}: ${err}`
            )
        } finally {
            client.release()
        }
        if (!result) return null
        count += Number((result.rows || [])[0]?.count || 0)
    }
    return count
}

async function calculateRecordCountBetweenBlockNumbers(
    chainId: string,
    viewPath: string, 
    fromBlockNumber: number,
    toBlockNumber: number,
): Promise<number | null> {
    const schema = schemaForChainId[chainId]
    const viewName = viewPath.split('.').pop()
    const chainViewPath = [schema, viewName].join('.')

    const client = await ChainTables.getConnection(schema)
    let result
    try {
        result = await client.query(
            `SELECT count(*) FROM ${identPath(chainViewPath)} WHERE block_number > $1 and block_number <= $2`,
            [fromBlockNumber, toBlockNumber],
        )
    } catch (err) {
        logger.error(
            `Failed to select count(*) from ${chainViewPath} where block_number (${fromBlockNumber} -> ${toBlockNumber}): ${err}`
        )
    } finally {
        client.release()
    }
    if (!result) return null

    return Number((result.rows || [])[0]?.count || 0)
}

async function deleteRecordCountDeltasBelowBlockNumber(
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
    const client = await ChainTables.getConnection(null)
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

async function getLatestBlockTimestampForView(viewPath: string, heads: StringKeyMap): Promise<string | null> {
    const chainIds = Object.keys(heads || {})

    const recordsByChain = await Promise.all(chainIds.map(chainId => (
        getLatestEventLovRecordForChainId(viewPath, chainId, Number(heads[chainId]))
    )))

    const recent = recordsByChain.filter(v => !!v).sort((a, b) => (
        new Date(b.blockTimestamp).getTime() - new Date(a.blockTimestamp).getTime()
    )) as StringKeyMap[]

    const latest = recent[0] || null

    return latest ? new Date(latest.blockTimestamp).toISOString() : null
}

async function getLatestEventLovRecordForChainId(
    givenViewPath: string, 
    chainId: string, 
    head: number | null,
): Promise<StringKeyMap | null> {
    const schema = schemaForChainId[chainId]
    const viewName = givenViewPath.split('.').pop()
    const viewPath = [schema, viewName].join('.')
    const historicalRange = chainId === chainIds.ARBITRUM ? 10000000 : 1000000
    const minBlock = head ? Math.max(head - historicalRange, 0) : 0
    const minBlockClause = minBlock > 0 ? ` where block_number >= ${literal(minBlock)}` : ''

    const rows = camelizeKeys((await ChainTables.query(schema,
        `select * from ${identPath(viewPath)}${minBlockClause} order by block_number desc limit 1`
    ))) as StringKeyMap[]

    return rows[0] || null
}

export default function job(params: StringKeyMap) {
    return {
        perform: async () => resetContractGroupEventRecordCounts(params.group)
    }
}