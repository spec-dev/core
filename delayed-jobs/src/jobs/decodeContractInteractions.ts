import {
    logger,
    StringKeyMap,
    getAbis,
    schemaForChainId,
    SharedTables,
    chainIds,
    enqueueDelayedJob,
    mapByKey,
    toChunks,
    sleep,
    contractRegistrationJobFailed,
    range,
    getBlockEventsSeriesNumber,
    updateContractRegistrationJobStatus,
    ContractRegistrationJobStatus,
    updateContractRegistrationJobCursors,
    getContractRegistrationJob,
    randomIntegerInRange,
    bulkSaveTransactions,
    bulkSaveTraces,
    bulkSaveLogs,
    decodeTransactions,
    decodeTraces,
    decodeLogs,
    decodeFunctionCalls,
} from '../../../shared'
import config from '../config'
import { ident } from 'pg-format'
import { Pool } from 'pg'
import processTransactionTraces from '../services/processTransactionTraces'

const SAVE_BATCH_SIZE = 2000

const MAX_PARALLEL_PROMISES = 10

const errors = {
    GENERAL: 'Error decoding contracts.',
    MISSING_ABIS: 'Contract ABI(s) missing.',
}

const buildTableRefsForChainId = (chainId: string): StringKeyMap => {
    const schema = schemaForChainId[chainId]
    if (!schema) throw `Invalid chainId ${chainId}`
    return {
        transactions: [ident(schema), 'transactions'].join('.'),
        traces: [ident(schema), 'traces'].join('.'),
        logs: [ident(schema), 'logs'].join('.'),
    }
}

async function decodeContractInteractions(
    chainId: string, 
    contractAddresses: string[],
    initialBlock: number | null,
    startBlock: number | null,
    queryRangeSize: number,
    jobRangeSize: number,
    registrationJobUid?: string,
    fullContractGroup?: string,
) {
    logger.info(`[${chainId}:${startBlock}] Decoding interactions for (${contractAddresses.join(', ')})...`)
    registrationJobUid && await updateContractRegistrationJobStatus(
        registrationJobUid, 
        ContractRegistrationJobStatus.Decoding,
    )

    // Get map of contract abis.
    const abisMap = await getAbisForContracts(contractAddresses, chainId)
    if (!abisMap) {
        registrationJobUid && await contractRegistrationJobFailed(registrationJobUid, errors.MISSING_ABIS)
        return
    }
    
    // Format tables to query based on chain-specific schema.
    const tables = buildTableRefsForChainId(chainId)

    const onDone = async (): Promise<boolean> => {
        await updateContractRegistrationJobCursors(registrationJobUid, contractAddresses, 1)
        await sleep(randomIntegerInRange(100, 500))

        const cursors = (await getContractRegistrationJob(registrationJobUid))?.cursors || {}
        const decodedAllContractsInRegistrationJob = Object.values(cursors).every(v => v === 1)

        if (decodedAllContractsInRegistrationJob) {
            await updateContractRegistrationJobStatus(
                registrationJobUid,
                ContractRegistrationJobStatus.Complete,
            )
            return true
        }

        return false
    }

    // Determine the earliest block in which this contract was interacted with 
    // and use that as the "start" block if no start block was specified.
    startBlock = startBlock === null ? await findStartBlock(tables, contractAddresses) : startBlock
    if (startBlock === null) {
        logger.error(`No interactions detected for (${contractAddresses.join(', ')}). Stopping.`)
        let shouldResetEventRecordCounts = true
        if (registrationJobUid) {
            shouldResetEventRecordCounts = await onDone()
        }
        if (shouldResetEventRecordCounts && fullContractGroup) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { fullContractGroup })
        }
        return
    }

    // Initial start block for the entire decoding of this contract.
    initialBlock = initialBlock === null ? startBlock : initialBlock

    // Create connection pool.
    const pool = new Pool({
        host: config.SHARED_TABLES_DB_HOST,
        port: config.SHARED_TABLES_DB_PORT,
        user: config.SHARED_TABLES_DB_USERNAME,
        password: config.SHARED_TABLES_DB_PASSWORD,
        database: config.SHARED_TABLES_DB_NAME,
        max: config.SHARED_TABLES_MAX_POOL_SIZE,
    })
    pool.on('error', err => logger.error('PG client error', err))

    // Decode all transactions, traces, and logs that 
    // involve any of these contracts in this block range.
    const finalEndBlock = await getBlockEventsSeriesNumber(chainId)
    const endCursor = await decodePrimitivesUsingContracts(
        chainId,
        contractAddresses,
        abisMap,
        tables,
        startBlock,
        queryRangeSize,
        jobRangeSize,
        initialBlock,
        finalEndBlock,
        pool,
        registrationJobUid,
    )
    await pool.end()

    // All contract interactions decoded *for this contract*.
    if (endCursor >= finalEndBlock) {
        logger.info(`Fully decoded contract interactions for (${contractAddresses.join(', ')})`)
        let shouldResetEventRecordCounts = true
        if (registrationJobUid) {
            shouldResetEventRecordCounts = await onDone()
        }
        if (shouldResetEventRecordCounts && fullContractGroup) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { fullContractGroup })
        }
        return
    }

    // Enqueue next job in series.
    await enqueueDelayedJob('decodeContractInteractions', {
        chainId, 
        contractAddresses,
        initialBlock,
        startBlock: endCursor,
        queryRangeSize,
        jobRangeSize,
        registrationJobUid,
        fullContractGroup,
    })
}

async function decodePrimitivesUsingContracts(
    chainId: string, 
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
    startBlock: number,
    queryRangeSize: number,
    jobRangeSize: number,
    initialBlock: number,
    finalEndBlock: number,
    pool: Pool,
    registrationJobUid: string,
): Promise<number> {
    const onPolygon = [chainIds.POLYGON, chainIds.MUMBAI].includes(chainId)
    const stopAtBlock = Math.min(startBlock + jobRangeSize, finalEndBlock)

    let batchTransactions = []
    let batchTraces = []
    let batchNewTraces = []
    let batchLogs = []
    let cursor = startBlock

    const completed = startBlock - initialBlock
    const range = finalEndBlock - initialBlock
    let progress = completed / range

    logger.info(`[${chainId}] Decoding ${startBlock} --> ${stopAtBlock}:\n${
        contractAddresses.map(address => `   - ${address}`).join('\n')
    }\n`)

    while (cursor < stopAtBlock) {
        await updateContractRegistrationJobCursors(registrationJobUid, contractAddresses, progress)
        const start = cursor
        const end = Math.min(cursor + queryRangeSize - 1, stopAtBlock)
    
        let [transactions, traces, logs] = await Promise.all([
            decodeTransactions(start, end, contractAddresses, abisMap, tables),
            decodeTraces(start, end, contractAddresses, abisMap, tables),
            decodeLogs(start, end, contractAddresses, abisMap, tables),
        ])
        transactions = transactions || []
        traces = traces || []
        logs = logs || []

        // NOTE: Turning off for now (10.11.23 - @whittlbc)
        // If on Polygon, ensure all traces have been pulled for these transactions since 
        // we're lazy-loading traces on Polygon due to the lack of a `trace_block` RPC endpoint.
        // if (onPolygon) {
        //     const newTraces = await ensureTracesExistForEachTransaction(transactions, traces, abisMap, chainId)
        //     batchNewTraces.push(...newTraces)
        // }

        batchTransactions.push(...transactions)
        batchTraces.push(...traces)
        batchLogs.push(...logs)
        
        const saveTransactions = batchTransactions.length > SAVE_BATCH_SIZE
        const saveTraces = batchTraces.length > SAVE_BATCH_SIZE
        const insertNewTraces = batchNewTraces.length > SAVE_BATCH_SIZE
        const saveLogs = batchLogs.length > SAVE_BATCH_SIZE

        let savePromises = []

        if (saveTransactions) {
            const txChunks = toChunks(batchTransactions, SAVE_BATCH_SIZE)
            savePromises.push(...txChunks.map(chunk => bulkSaveTransactions(chunk, tables.transactions, pool, true)))
            batchTransactions = []
        }
        if (savePromises.length > MAX_PARALLEL_PROMISES) {
            await Promise.all(savePromises)
            savePromises = []
        }

        if (saveTraces) {
            const traceChunks = toChunks(batchTraces, SAVE_BATCH_SIZE)
            savePromises.push(...traceChunks.map(chunk => bulkSaveTraces(chunk, tables.traces, pool, true)))
            batchTraces = []
        }
        if (savePromises.length > MAX_PARALLEL_PROMISES) {
            await Promise.all(savePromises)
            savePromises = []
        }

        if (insertNewTraces) {
            const newTraceChunks = toChunks(batchNewTraces, SAVE_BATCH_SIZE)
            savePromises.push(...newTraceChunks.map(chunk => bulkInsertNewTraces(chunk, tables.traces, pool)))
            batchNewTraces = []
        }
        if (savePromises.length > MAX_PARALLEL_PROMISES) {
            await Promise.all(savePromises)
            savePromises = []
        }

        if (saveLogs) {
            const logChunks = toChunks(batchLogs, SAVE_BATCH_SIZE)
            savePromises.push(...logChunks.map(chunk => bulkSaveLogs(chunk, tables.logs, pool, true)))
            batchLogs = []
        }
        await Promise.all(savePromises)

        cursor = cursor + queryRangeSize
    }

    const savePromises = []
    batchTransactions.length && savePromises.push(bulkSaveTransactions(batchTransactions, tables.transactions, pool, true))
    batchTraces.length && savePromises.push(bulkSaveTraces(batchTraces, tables.traces, pool, true))
    batchNewTraces.length && savePromises.push(bulkInsertNewTraces(batchNewTraces, tables.traces, pool))
    batchLogs.length && savePromises.push(bulkSaveLogs(batchLogs, tables.logs, pool, true))
    savePromises.length && await Promise.all(savePromises)

    return cursor
}

export async function ensureTracesExistForEachTransaction(
    transactions: StringKeyMap[],
    traces: StringKeyMap[],
    abisMap: StringKeyMap,
    chainId: string,
): Promise<StringKeyMap[]> {
    const tracesByTxHash = mapByKey(traces, 'transactionHash')
    const txsToFetchTracesFor = transactions.filter(tx => !tracesByTxHash[tx.hash])
    if (!txsToFetchTracesFor.length) return []
    logger.info(`[${chainId}] Tracing ${txsToFetchTracesFor.length} untraced transactions...`)

    const txGroups = toChunks(txsToFetchTracesFor, 10)
    let newTraces = []
    for (const txs of txGroups) {
        const groupTraces = (await Promise.all(txs.map(tx => traceTransaction(
            tx.hash,
            tx.transactionIndex,
            tx.blockNumber,
            tx.blockHash,
            tx.blockTimestamp,
            chainId,
        )))).flat()
        newTraces.push(...groupTraces)
    }

    return decodeFunctionCalls(newTraces, abisMap)
}

async function traceTransaction(
    transactionHash: string,
    transactionIndex: number,
    blockNumber: number,
    blockHash: string,
    blockTimestamp: string,
    chainId: string,
): Promise<StringKeyMap[]> {
    let externalTraceData = null
    let numAttempts = 0

    try {
        while (externalTraceData === null && numAttempts < 10) {
            externalTraceData = await fetchTxTraces(transactionHash, chainId)
            if (externalTraceData === null) {
                await sleep(
                    (1.5 ** numAttempts) * 200
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        logger.error(`[${chainId}] Error fetching traces for transaction ${transactionHash}: ${err}`)
        return []
    }

    if (externalTraceData === null) {
        logger.error(`[${chainId}] Out of attempts - No traces found for transaction ${transactionHash}...`)
        return []
    }

    if (Object.keys(externalTraceData).length === 0) {
        return []
    }

    return processTransactionTraces(
        externalTraceData,
        transactionHash,
        transactionIndex,
        blockNumber,
        blockHash,
        blockTimestamp,
    )
}

async function fetchTxTraces(txHash: string, chainId: string): Promise<StringKeyMap | null> {
    const url = chainId === chainIds.POLYGON 
        ? config.POLYGON_ALCHEMY_REST_URL 
        : config.MUMBAI_ALCHEMY_REST_URL

    let resp, error
    try {
        resp = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                method: 'debug_traceTransaction',
                params: [txHash, { tracer: 'callTracer' }],
                id: 1,
                jsonrpc: '2.0',
            }),
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (err) {
        error = err
    }

    if (error) {
        logger.error(`[${chainId}] Error fetching traces for transaction ${txHash}: ${error}. Will retry`)
        return null
    }

    let data: { [key: string]: any } = {}
    try {
        data = await resp.json()
    } catch (err) {
        logger.error(
            `[${chainId}] Error parsing json response while fetching traces for transaction ${txHash}: ${err}`
        )
        data = {}
    }

    if (data?.error?.code === -32000 || !data?.result) {
        return null
    } else if (data?.error) {
        logger.error(`[${chainId}] Error fetching trace for transaction ${txHash}: ${data.error.code} - ${data.error.message}`)
        return null
    } else {
        return data.result || {}
    }
}

export async function bulkInsertNewTraces(traces: StringKeyMap[], table: string, pool: Pool) {
    logger.info(`Saving ${traces.length} new traces...`)

    const insertPlaceholders = []
    const insertBindings = []
    let i = 1
    for (const trace of traces) {
        let functionArgs
        try {
            functionArgs = trace.functionArgs === null ? null : JSON.stringify(trace.functionArgs)
        } catch (e) {
            continue
        }
        let functionOutputs
        try {
            functionOutputs = trace.functionOutputs === null ? null : JSON.stringify(trace.functionOutputs)
        } catch (e) {
            continue
        }
        insertPlaceholders.push(`(${range(i, i + 23).map(n => `$${n}`).join(', ')})`)
        insertBindings.push(...[
            trace.id,
            trace.transactionHash,
            trace.transactionIndex,
            trace.from || null,
            trace.to || null,
            trace.value || null,
            trace.input || null,
            trace.output || null,
            trace.functionName || null,
            functionArgs,
            functionOutputs,
            trace.traceType,
            trace.callType || null,
            trace.subtraces,
            trace.traceAddress,
            trace.traceIndex,
            trace.traceIndexIsPerTx,
            trace.error || null,
            trace.status,
            trace.gas || null,
            trace.gasUsed || null,
            trace.blockHash,
            trace.blockNumber,
            trace.blockTimestamp,
        ])
        i += 24
    }

    const columns = [
        'id',
        'transaction_hash',
        'transaction_index',
        ident('from'),
        ident('to'),
        'value',
        'input',
        'output',
        'function_name',
        'function_args',
        'function_outputs',
        'trace_type',
        'call_type',
        'subtraces',
        'trace_address',
        'trace_index',
        'trace_index_is_per_tx',
        'error',
        'status',
        'gas',
        'gas_used',
        'block_hash',
        'block_number',
        'block_timestamp',
    ]

    const insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${insertPlaceholders.join(', ')} ON CONFLICT (id) DO NOTHING`

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(insertQuery, insertBindings)
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK')
        logger.error(e)
    } finally {
        client.release()
    }
}

async function getAbisForContracts(contractAddresses: string[], chainId: string): Promise<StringKeyMap | null> {
    const abisMap = (await getAbis(contractAddresses, chainId)) || {}
    const withAbis = new Set(Object.keys(abisMap))
    if (withAbis.size !== contractAddresses.length) {
        const missing = contractAddresses.filter(a => !withAbis.has(a))
        logger.error(`Not all contracts have ABIs to act on. Missing: ${missing.join(', ')}`)
        return null
    }
    return abisMap
}

async function findStartBlock(tables: StringKeyMap, contractAddresses: string[]): Promise<number | null> {
    const blockNumbers = await Promise.all([
        findEarliestInteraction(tables.transactions, 'to', contractAddresses),
        findEarliestInteraction(tables.traces, 'to', contractAddresses),
        findEarliestInteraction(tables.logs, 'address', contractAddresses),
    ])
    const notNullBlockNumbers = blockNumbers.filter(n => n !== null)
    return notNullBlockNumbers.length ? Math.min(...notNullBlockNumbers) : null
}

async function findEarliestInteraction(table: string, column: string, addresses: string[]): Promise<number | null> {
    const addressPlaceholders = addresses.map((_, i) => `$${i + 1}`).join(', ')
    try {
        const results = (await SharedTables.query(
            `select "block_number" from ${table} where ${ident(column)} in (${addressPlaceholders}) order by "block_number" asc limit 1`,
            addresses,
        )) || []
        const number = Number((results[0] || {}).block_number)
        return Number.isNaN(number) ? null : number
    } catch (err) {
        throw `Failed to query ${table} while looking for earliest block interaction: ${JSON.stringify(err)}`
    }
}

export default function job(params: StringKeyMap) {
    const chainId = params.chainId
    const contractAddresses = params.contractAddresses || []
    const initialBlock = params.hasOwnProperty('initialBlock') ? params.initialBlock : null
    const startBlock = params.hasOwnProperty('startBlock') ? params.startBlock : null
    const queryRangeSize = params.queryRangeSize || config.QUERY_BLOCK_RANGE_SIZE
    const jobRangeSize = params.jobRangeSize || config.JOB_BLOCK_RANGE_SIZE
    const registrationJobUid = params.registrationJobUid
    const fullContractGroup = params.fullContractGroup

    return {
        perform: async () => {
            try {
                await decodeContractInteractions(
                    chainId, 
                    contractAddresses, 
                    initialBlock,
                    startBlock,
                    queryRangeSize,
                    jobRangeSize,
                    registrationJobUid,
                    fullContractGroup,
                )
            } catch (err) {
                logger.error(err)
                registrationJobUid && await contractRegistrationJobFailed(registrationJobUid, errors.GENERAL)
            }
        }
    }
}