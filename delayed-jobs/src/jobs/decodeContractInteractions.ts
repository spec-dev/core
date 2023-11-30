import {
    logger,
    StringKeyMap,
    getAbis,
    schemaForChainId,
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
    getContractRegistrationJob,
    randomIntegerInRange,
    bulkSaveTransactions,
    bulkSaveLogs,
    decodeTransactions,
    ChainTables,
    decodeLogs,
    decodeFunctionCalls,
    setDecodeJobProgress,
    identPath,
    getDecodeJobRangeCount,
    getDecodeJobProgress,
    deleteCoreRedisKeys,
} from '../../../shared'
import config from '../config'
import { ident } from 'pg-format'
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
    group: string,
    chainId: string, 
    contractAddresses: string[],
    initialBlock: number | null,
    startBlock: number | null,
    endBlock: number | null,
    queryRangeSize: number,
    jobRangeSize: number,
    cursorIndex: number,
    registrationJobUid?: string,
) {
    logger.info(`[${chainId}:${startBlock}] Decoding ${contractAddresses.join(', ')}...`)
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
    
    // Determine the earliest block in which this contract was interacted with 
    // and use that as the "start" block if no start block was specified.
    const schema = schemaForChainId[chainId]
    startBlock = startBlock === null ? await findStartBlock(schema, contractAddresses) : startBlock
    if (startBlock === null) {
        logger.warn(`No interactions detected yet for ${contractAddresses.join(', ')}.`)
        let shouldResetEventRecordCounts = true
        if (registrationJobUid) {
            shouldResetEventRecordCounts = await checkIfJobDone(
                registrationJobUid,
                group,
                chainId,
                contractAddresses,
                cursorIndex,
            )
        }
        if (shouldResetEventRecordCounts && group) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { group })
        }
        return
    }

    initialBlock = initialBlock === null ? startBlock : initialBlock
    endBlock = endBlock || await getBlockEventsSeriesNumber(chainId)
    const tables = buildTableRefsForChainId(chainId)

    const endCursor = await decodePrimitivesUsingContracts(
        group,
        chainId,
        contractAddresses,
        abisMap,
        tables,
        startBlock,
        endBlock,
        queryRangeSize,
        jobRangeSize,
        initialBlock,
        cursorIndex,
        registrationJobUid,
    )

    // All contract interactions decoded *for this contract*.
    if (endCursor >= endBlock) {
        logger.info(`Fully decoded contract interactions for (${contractAddresses.join(', ')})`)
        let shouldResetEventRecordCounts = true
        if (registrationJobUid) {
            shouldResetEventRecordCounts = await checkIfJobDone(
                registrationJobUid,
                group,
                chainId,
                contractAddresses,
                cursorIndex,
            )
        }
        if (shouldResetEventRecordCounts && group) {
            await enqueueDelayedJob('resetContractGroupEventRecordCounts', { group })
        }
        return
    }

    // Enqueue next job in series.
    await enqueueDelayedJob('decodeContractInteractions', {
        group,
        chainId,
        contractAddresses,
        initialBlock,
        startBlock: endCursor,
        endBlock,
        queryRangeSize,
        jobRangeSize,
        cursorIndex,
        registrationJobUid,
    })
}

async function decodePrimitivesUsingContracts(
    group: string,
    chainId: string, 
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
    startBlock: number,
    endBlock: number,
    queryRangeSize: number,
    jobRangeSize: number,
    initialBlock: number,
    cursorIndex: number,
    registrationJobUid: string,
): Promise<number> {
    const contractName = group.split('.').pop()
    const stopAtBlock = Math.min(startBlock + jobRangeSize, endBlock)
    const chainSchema = schemaForChainId[chainId]

    let batchTransactions = []
    let batchLogs = []

    logger.info(`[${chainId}:${group}] Decoding ${startBlock} --> ${stopAtBlock}:\n${
        contractAddresses.map(address => `   - ${address}`).join('\n')
    }\n`)
    
    let cursor = startBlock
    const range = endBlock - initialBlock
    while (cursor <= stopAtBlock) {
        let completed = cursor - initialBlock
        let progress = completed / range

        const progressKeys = contractAddresses.map(address => (
            [registrationJobUid, contractName, chainId, address, cursorIndex].join(':')
        ))
        registrationJobUid && await Promise.all(progressKeys.map(key => setDecodeJobProgress(key, progress)))

        const start = cursor
        const end = Math.min(cursor + queryRangeSize - 1, stopAtBlock)
    
        let [transactions, logs] = await Promise.all([
            decodeTransactions(chainSchema, start, end, contractAddresses, abisMap, tables),
            decodeLogs(chainSchema, start, end, contractAddresses, abisMap, tables),
        ])
        transactions = transactions || []
        logs = logs || []

        batchTransactions.push(...transactions)
        batchLogs.push(...logs)
        
        const saveTransactions = batchTransactions.length > SAVE_BATCH_SIZE
        const saveLogs = batchLogs.length > SAVE_BATCH_SIZE

        let savePromises = []

        if (saveTransactions) {
            const txChunks = toChunks(batchTransactions, SAVE_BATCH_SIZE)
            savePromises.push(...txChunks.map(chunk => bulkSaveTransactions(chainSchema, chunk, tables.transactions, true)))
            batchTransactions = []
        }
        if (savePromises.length > MAX_PARALLEL_PROMISES) {
            await Promise.all(savePromises)
            savePromises = []
        }
        if (saveLogs) {
            const logChunks = toChunks(batchLogs, SAVE_BATCH_SIZE)
            savePromises.push(...logChunks.map(chunk => bulkSaveLogs(chainSchema, chunk, tables.logs, true)))
            batchLogs = []
        }
        await Promise.all(savePromises)

        cursor += queryRangeSize
    }

    const savePromises = []
    batchTransactions.length && savePromises.push(bulkSaveTransactions(chainSchema, batchTransactions, tables.transactions, true))
    batchLogs.length && savePromises.push(bulkSaveLogs(chainSchema, batchLogs, tables.logs, true))
    savePromises.length && await Promise.all(savePromises)

    return cursor
}

export async function checkIfJobDone(
    registrationJobUid: string,
    currentGroupName: string,
    chainId?: string,
    contractAddresses?: string[],
    cursorIndex?: number,
): Promise<boolean> {
    const contractName = currentGroupName.split('.').pop()
    contractAddresses = contractAddresses || []
    const progressKeys = contractAddresses.map(address => (
        [registrationJobUid, contractName, chainId, address, cursorIndex].join(':')
    ))
    await Promise.all(progressKeys.map(key => setDecodeJobProgress(key, 1)))
    await sleep(randomIntegerInRange(100, 500))

    let done = true
    const allGroupsInJob = (await getContractRegistrationJob(registrationJobUid))?.groups || []

    const jobKeys = []
    for (const group of allGroupsInJob) {
        const instances = (group.instances || []).map(key => {
            const split = key.split(':')
            return { chainId: split[0], address: split[1] }
        })
        if (!instances.length) continue

        for (const instance of instances) {
            const decodeJobKey = [registrationJobUid, group.name, instance.chainId, instance.address, 'num-range-jobs'].join(':')
            jobKeys.push(decodeJobKey)
            const numRangeJobs = await getDecodeJobRangeCount(decodeJobKey)
            if (!numRangeJobs) {
                done = false
                break
            }

            for (let i = 0; i < numRangeJobs; i++) {
                const progressKey = [registrationJobUid, group.name, instance.chainId, instance.address, i].join(':')
                jobKeys.push(progressKey)
                const progress = await getDecodeJobProgress(progressKey)
                if (progress != 1) {
                    done = false
                    break
                }
            }
        }
        if (!done) break
    }
    if (!done) return false

    await Promise.all([
        updateContractRegistrationJobStatus(registrationJobUid, ContractRegistrationJobStatus.Complete),
        deleteCoreRedisKeys(jobKeys),
    ])

    return true
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

export async function bulkInsertNewTraces(schema: string, traces: StringKeyMap[], table: string) {
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

    const client = await ChainTables.getConnection(schema)
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

export async function findStartBlock(schema: string, contractAddresses: string[]): Promise<number | null> {
    const blockNumbers = await Promise.all([
        findEarliestInteraction(schema, 'transactions', 'to', contractAddresses),
        findEarliestInteraction(schema, 'logs', 'address', contractAddresses),
    ])
    const notNullBlockNumbers = blockNumbers.filter(n => n !== null)
    return notNullBlockNumbers.length ? Math.min(...notNullBlockNumbers) : null
}

async function findEarliestInteraction(schema: string, table: string, column: string, addresses: string[]): Promise<number | null> {
    const addressPlaceholders = addresses.map((_, i) => `$${i + 1}`).join(', ')
    try {
        const results = (await ChainTables.query(schema,
            `select "block_number" from ${identPath([schema, table].join('.'))} where ${ident(column)} in (${addressPlaceholders}) order by "block_number" asc limit 1`,
            addresses,
        )) || []
        const number = Number((results[0] || {}).block_number)
        return Number.isNaN(number) ? null : number
    } catch (err) {
        throw `Failed to query ${table} while looking for earliest block interaction: ${JSON.stringify(err)}`
    }
}

export default function job(params: StringKeyMap) {
    const group = params.group
    const chainId = params.chainId
    const contractAddresses = params.contractAddresses || []
    const initialBlock = params.hasOwnProperty('initialBlock') ? params.initialBlock : null
    const startBlock = params.hasOwnProperty('startBlock') ? params.startBlock : null
    const endBlock = params.hasOwnProperty('endBlock') ? params.endBlock : null
    const queryRangeSize = params.queryRangeSize || config.QUERY_BLOCK_RANGE_SIZE
    const jobRangeSize = params.jobRangeSize || config.JOB_BLOCK_RANGE_SIZE
    const cursorIndex = params.cursorIndex || 0
    const registrationJobUid = params.registrationJobUid

    return {
        perform: async () => {
            try {
                await decodeContractInteractions(
                    group,
                    chainId, 
                    contractAddresses, 
                    initialBlock,
                    startBlock,
                    endBlock,
                    queryRangeSize,
                    jobRangeSize,
                    cursorIndex,
                    registrationJobUid,
                )
            } catch (err) {
                logger.error(err)
                registrationJobUid && await contractRegistrationJobFailed(registrationJobUid, errors.GENERAL)
            }
        }
    }
}