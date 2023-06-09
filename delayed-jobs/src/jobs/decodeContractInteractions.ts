import {
    logger,
    StringKeyMap,
    getAbis,
    schemaForChainId,
    Abi,
    SharedTables,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    formatAbiValueWithType,
    chainIds,
    enqueueDelayedJob,
    mapByKey,
    toChunks,
    sleep,
    contractRegistrationJobFailed,
    splitLogDataToWords,
    normalizeEthAddress,
    hexToNumberString,
    range,
    getBlockEventsSeriesNumber,
    updateContractRegistrationJobStatus,
    ContractRegistrationJobStatus,
    updateContractRegistrationJobCursors,
    getContractRegistrationJobProgress,
    specialErc20BalanceAffectingAbis,
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
    BATCH_TRANSFER_INPUTS,
} from '../../../shared'
import config from '../config'
import { ident } from 'pg-format'
import { camelizeKeys } from 'humps'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'
import processTransactionTraces from '../services/processTransactionTraces'

const web3 = new Web3()

const SAVE_BATCH_SIZE = 2000

const errors = {
    GENERAL: 'Error decoding contracts',
    MISSING_ABIS: 'Contract ABI(s) missing',
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

    // Determine the earliest block in which this contract was interacted with 
    // and use that as the "start" block if no start block was specified.
    startBlock = startBlock === null ? await findStartBlock(tables, contractAddresses) : startBlock
    if (startBlock === null) {
        logger.error(`No interactions with any of these contracts so far. Stopping.`)
        registrationJobUid && await updateContractRegistrationJobStatus(
            registrationJobUid, 
            ContractRegistrationJobStatus.Complete,
        )
        return
    }
    // Initial start block for the entire decoding of this contract.
    initialBlock = initialBlock === null ? startBlock : initialBlock

    // Create connection pool.
    const pool = new Pool({
        host : config.SHARED_TABLES_DB_HOST,
        port : config.SHARED_TABLES_DB_PORT,
        user : config.SHARED_TABLES_DB_USERNAME,
        password : config.SHARED_TABLES_DB_PASSWORD,
        database : config.SHARED_TABLES_DB_NAME,
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
        await updateContractRegistrationJobCursors(registrationJobUid, contractAddresses, 1)
        const cursors = (await getContractRegistrationJobProgress(registrationJobUid)).cursors || {}
        const decodedAllContractsInRegistrationJob = Object.values(cursors).every(v => v === 1)
        if (decodedAllContractsInRegistrationJob) {
            // TODO: Enqueue new job to index LOVs dependent on these contracts.
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
        logger.info(`[${chainId}] ${start} --> ${end}...`)
    
        let [transactions, traces, logs] = await Promise.all([
            decodeTransactions(start, end, contractAddresses, abisMap, tables),
            decodeTraces(start, end, contractAddresses, abisMap, tables),
            decodeLogs(start, end, contractAddresses, abisMap, tables),
        ])

        // If on Polygon, ensure all traces have been pulled for these transactions since 
        // we're lazy-loading traces on Polygon due to the lack of a `trace_block` RPC endpoint.
        if (onPolygon) {
            const newTraces = await ensureTracesExistForEachTransaction(transactions, traces, abisMap, chainId)
            batchNewTraces.push(...newTraces)
        }

        batchTransactions.push(...transactions)
        batchTraces.push(...traces)
        batchLogs.push(...logs)
        
        const saveTransactions = batchTransactions.length > SAVE_BATCH_SIZE
        const saveTraces = batchTraces.length > SAVE_BATCH_SIZE
        const insertNewTraces = batchNewTraces.length > SAVE_BATCH_SIZE
        const saveLogs = batchLogs.length > SAVE_BATCH_SIZE

        const savePromises = []
        saveTransactions && savePromises.push(bulkSaveTransactions(batchTransactions, tables.transactions, pool))
        saveTraces && savePromises.push(bulkSaveTraces(batchTraces, tables.traces, pool))
        insertNewTraces && savePromises.push(bulkInsertNewTraces(batchNewTraces, tables.traces, pool))
        saveLogs && savePromises.push(bulkSaveLogs(batchLogs, tables.logs, pool))
        await Promise.all(savePromises)

        if (saveTransactions) {
            batchTransactions = []
        }
        if (saveTraces) {
            batchTraces = []
        }
        if (insertNewTraces) {
            batchNewTraces = []
        }
        if (saveLogs) {
            batchLogs = []
        }

        cursor = cursor + queryRangeSize
    }

    const savePromises = []
    batchTransactions.length && savePromises.push(bulkSaveTransactions(batchTransactions, tables.transactions, pool))
    batchTraces.length && savePromises.push(bulkSaveTraces(batchTraces, tables.traces, pool))
    batchNewTraces.length && savePromises.push(bulkInsertNewTraces(batchNewTraces, tables.traces, pool))
    batchLogs.length && savePromises.push(bulkSaveLogs(batchLogs, tables.logs, pool))
    await Promise.all(savePromises)

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

async function bulkSaveTransactions(transactions: StringKeyMap[], table: string, pool: Pool) {
    logger.info(`Saving ${transactions.length} decoded transactions...`)

    const tempTableName = `tx_${short.generate()}`
    const insertPlaceholders = []
    const insertBindings = []
    let i = 1
    for (const tx of transactions) {
        let functionArgs
        try {
            functionArgs = tx.functionArgs === null ? null : JSON.stringify(tx.functionArgs)
        } catch (e) {
            continue
        }
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
        insertBindings.push(...[tx.hash, tx.functionName, functionArgs])
        i += 3
    }
    
    const insertQuery = `INSERT INTO ${tempTableName} (hash, function_name, function_args) VALUES ${insertPlaceholders.join(', ')}`

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `CREATE TEMP TABLE ${tempTableName} (hash character varying(70) primary key, function_name character varying, function_args json) ON COMMIT DROP`
        )
        await client.query(insertQuery, insertBindings)
        await client.query(
            `UPDATE ${table} SET function_name = ${tempTableName}.function_name, function_args = ${tempTableName}.function_args FROM ${tempTableName} WHERE ${table}."hash" = ${tempTableName}.hash`
        )
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK')
        logger.error(e)
    } finally {
        client.release()
    }
}

async function bulkSaveTraces(traces: StringKeyMap[], table: string, pool: Pool) {
    logger.info(`Saving ${traces.length} decoded traces...`)

    const tempTableName = `trace_${short.generate()}`
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
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
        insertBindings.push(...[trace.id, trace.functionName, functionArgs, functionOutputs])
        i += 4
    }
    const insertQuery = `INSERT INTO ${tempTableName} (id, function_name, function_args, function_outputs) VALUES ${insertPlaceholders.join(', ')}`

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `CREATE TEMP TABLE ${tempTableName} (id character varying primary key, function_name character varying, function_args json, function_outputs json) ON COMMIT DROP`
        )
        await client.query(insertQuery, insertBindings)
        await client.query(
            `UPDATE ${table} SET function_name = ${tempTableName}.function_name, function_args = ${tempTableName}.function_args, function_outputs = ${tempTableName}.function_outputs FROM ${tempTableName} WHERE ${table}."id" = ${tempTableName}.id`
        )
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK')
        logger.error(e)
    } finally {
        client.release()
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

async function bulkSaveLogs(logs: StringKeyMap[], table: string, pool: Pool) {
    logger.info(`Saving ${logs.length} decoded logs...`)

    const tempTableName = `logs_${short.generate()}`
    const insertPlaceholders = []
    const insertBindings = []
    let i = 1
    for (const log of logs) {
        let eventArgs
        try {
            eventArgs = log.eventArgs === null ? null : JSON.stringify(log.eventArgs)
        } catch (e) {
            continue
        }
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
        insertBindings.push(...[log.logIndex, log.transactionHash, log.eventName, eventArgs])
        i += 4
    }

    const insertQuery = `INSERT INTO ${tempTableName} (log_index, transaction_hash, event_name, event_args) VALUES ${insertPlaceholders.join(', ')}`

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(
            `CREATE TEMP TABLE ${tempTableName} (log_index bigint not null, transaction_hash character varying(70) not null, event_name character varying, event_args json, CONSTRAINT ${tempTableName}_pk PRIMARY KEY (log_index, transaction_hash)) ON COMMIT DROP`
        )
        await client.query(insertQuery, insertBindings)
        await client.query(
            `UPDATE ${table} SET event_name = ${tempTableName}.event_name, event_args = ${tempTableName}.event_args FROM ${tempTableName} WHERE ${table}."log_index" = ${tempTableName}.log_index AND ${table}."transaction_hash" = ${tempTableName}.transaction_hash`
        )
        await client.query('COMMIT')
    } catch (e) {
        await client.query('ROLLBACK')
        logger.error(e)
    } finally {
        client.release()
    }
}

async function decodeTransactions(
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
): Promise<StringKeyMap[]> {
    // Get all transactions sent *to* any of these contracts in this block range.
    const transactions = await findContractInteractionsInBlockRange(
        tables.transactions,
        ['hash', 'input', 'to', 'transaction_index', 'block_number', 'block_hash', 'block_timestamp'],
        startBlock,
        endBlock,
        contractAddresses,
    )

    // Decode all of them.
    return decodeFunctionCalls(transactions, abisMap)
}

async function decodeTraces(
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
): Promise<StringKeyMap[]> {
    // Get all traces calls *to* any of these contracts in this block range.
    const traces = (await findContractInteractionsInBlockRange(
        tables.traces,
        ['id', 'input', 'output', 'trace_type', 'to', 'transaction_hash'],
        startBlock,
        endBlock,
        contractAddresses,
    )).filter(trace => trace.traceType === 'call')

    // Decode all of them.
    return decodeFunctionCalls(traces, abisMap)
}

async function decodeLogs(
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
): Promise<StringKeyMap[]> {
    // Get all logs emitted by any of these contracts in this block range.
    const logs = await findContractLogsInBlockRange(
        tables.logs,
        startBlock,
        endBlock,
        contractAddresses,
    )

    // Decode all of them.
    return decodeLogEvents(logs, abisMap)
}

async function findContractInteractionsInBlockRange(
    table: string,
    columns: string[],
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
): Promise<StringKeyMap[]> {
    let i = 0
    const addressPlaceholders = contractAddresses.map(() => {
        i++
        return `$${i}`
    }).join(', ')
    try {
        return camelizeKeys((await SharedTables.query(
            `select ${columns.map(ident).join(', ')} from ${table} where "to" in (${addressPlaceholders}) and "block_number" >= $${i + 1} and "block_number" <= $${i + 2}`,
            [ ...contractAddresses, startBlock, endBlock ],
        )) || [])
    } catch (err) {
        logger.error(
            `Failed to query ${table} for block_number range (${startBlock} -> ${endBlock}): ${JSON.stringify(err)}`
        )
    }
}

async function findContractLogsInBlockRange(
    table: string,
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
): Promise<StringKeyMap[]> {
    let i = 0
    const addressPlaceholders = contractAddresses.map(() => {
        i++
        return `$${i}`
    }).join(', ')
    try {
        return camelizeKeys((await SharedTables.query(
            `select * from ${table} where "address" in (${addressPlaceholders}) and "block_number" >= $${i + 1} and "block_number" <= $${i + 2}`,
            [ ...contractAddresses, startBlock, endBlock ],
        )) || [])
    } catch (err) {
        logger.error(
            `Failed to query ${table} for block_number range (${startBlock} -> ${endBlock}): ${JSON.stringify(err)}`
        )
    }
}

function decodeFunctionCalls(
    records: StringKeyMap[],
    abisMap: { [key: string]: Abi },
): StringKeyMap[] {
    const final = []
    for (let record of records) {
        if (!record.to || !abisMap.hasOwnProperty(record.to) || !record.input) {
            final.push(record)
            continue
        }
        record = decodeFunctionCall(record, abisMap[record.to])
        final.push(record)
    }
    return records
}

function decodeFunctionCall(record: StringKeyMap, abi: Abi): StringKeyMap {
    const inputSig = record.input?.slice(0, 10) || ''
    const inputData = record.input?.slice(10) || ''
    if (!inputSig) return record

    const abiItem = abi.find(item => item.signature === inputSig)
    if (!abiItem) return record

    record.functionName = abiItem.name
    record.functionArgs = []
    record.functionOutputs = []

    // Decode function inputs.
    if (abiItem.inputs?.length) {
        let functionArgs
        try {
            functionArgs = decodeFunctionArgs(abiItem.inputs, inputData)
        } catch (err) {
            logger.error(err.message)
        }

        // Ensure args are stringifyable.
        try {
            functionArgs && JSON.stringify(functionArgs)
        } catch (err) {
            functionArgs = null
            logger.warn(`Function args not stringifyable`, functionArgs)
        }
        if (functionArgs) {
            record.functionArgs = functionArgs
        }
    }

    // Decode function outputs (only traces can have these).
    if (abiItem.outputs?.length && !!record.output && record.output.length > 2) { // 0x
        let functionOutputs
        try {
            functionOutputs = decodeFunctionArgs(abiItem.outputs, record.output.slice(2))
        } catch (err) {
            logger.error(err.message)
        }

        // Ensure outputs are stringifyable.
        try {
            functionOutputs && JSON.stringify(functionOutputs)
        } catch (err) {
            functionOutputs = null
            logger.warn(`Function outputs not stringifyable`, functionOutputs)
        }

        if (functionOutputs) {
            record.functionOutputs = functionOutputs
        }
    }

    return record
}

function decodeFunctionArgs(inputs: StringKeyMap[], inputData: string): StringKeyMap[] | null {
    let functionArgs
    try {
        const inputsWithNames = ensureNamesExistOnAbiInputs(inputs)
        const values = web3.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
        functionArgs = groupAbiInputsWithValues(inputsWithNames, values)
    } catch (err) {
        if (err.reason?.includes('out-of-bounds') && 
            err.code === 'BUFFER_OVERRUN' && 
            inputData.length % 64 === 0 &&
            inputs.length > (inputData.length / 64)
        ) {
            const numInputsToUse = inputData.length / 64
            return decodeFunctionArgs(inputs.slice(0, numInputsToUse), inputData)
        }
        return null
    }
    return functionArgs || []
}

function decodeLogEvents(logs: StringKeyMap[], abis: { [key: string]: Abi }): StringKeyMap[] {
    const finalLogs = []
    for (let log of logs) {
        // Standard contract ABI decoding.
        if (log.address && log.topic0 && abis.hasOwnProperty(log.address)) {
            try {
                log = decodeLogEvent(log, abis[log.address])
            } catch (err) {
                logger.warn(`Error decoding log for address ${log.address}: ${err}`)
            }
        }
        // Try decoding as transfer event if couldn't decode with contract ABI.
        if (!log.eventName) {
            try {
                log = tryDecodingLogAsTransfer(log)
            } catch (err) {
                logger.warn(`Error decoding log as transfer (address=${log.address}, topic0=${log.topic0}): ${err}`)
            }
        }
        // Try decoding with any special, non-standard, ERC-20 events that may affect balances.
        if (!log.eventName && log.address && log.topic0 && log.topic1 && specialErc20BalanceAffectingAbis[log.topic0]) {
            const abi = specialErc20BalanceAffectingAbis[log.topic0]
            try {
                log = decodeLogEvent(log, [abi])
            } catch (err) {
                logger.warn(
                    `Error decoding log with special ERC-20 balance-affecting ABI (${log.topic0}):`,
                    log,
                    err
                )
            }
        }
        finalLogs.push(log)

    }
    return finalLogs
}

function decodeLogEvent(log: StringKeyMap, abi: Abi): StringKeyMap {
    const abiItem = abi.find(item => item.signature === log.topic0)
    if (!abiItem) return log

    const argNames = []
    const argTypes = []
    const abiInputs = abiItem.inputs || []
    for (let i = 0; i < abiInputs.length; i++) {
        const input = abiInputs[i]
        argNames.push(input.name || `param${i}`)
        argTypes.push(input.type)
    }

    const topics = []
    abiItem.anonymous && topics.push(log.topic0)
    log.topic1 && topics.push(log.topic1)
    log.topic2 && topics.push(log.topic2)
    log.topic3 && topics.push(log.topic3)

    const decodedArgs = web3.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
    const numArgs = parseInt(decodedArgs.__length__)

    const argValues = []
    for (let i = 0; i < numArgs; i++) {
        const stringIndex = i.toString()
        if (!decodedArgs.hasOwnProperty(stringIndex)) continue
        argValues.push(decodedArgs[stringIndex])
    }
    if (argValues.length !== argTypes.length) return log

    const eventArgs = []
    for (let j = 0; j < argValues.length; j++) {
        eventArgs.push({
            name: argNames[j],
            type: argTypes[j],
            value: formatAbiValueWithType(argValues[j], argTypes[j]),
        })
    }

    log.eventName = abiItem.name
    log.eventArgs = eventArgs

    // Ensure args are stringifyable.
    try {
        JSON.stringify(eventArgs)
    } catch (err) {
        log.eventArgs = null
        logger.warn(
            `Log event args not stringifyable (transaction_hash=${log.transactionHash}, log_index=${log.logIndex})`
        )
    }
    return log
}

function tryDecodingLogAsTransfer(log: StringKeyMap): StringKeyMap {
    let eventName, eventArgs

    // Transfer
    if (log.topic0 === TRANSFER_TOPIC) {
        eventArgs = decodeTransferEvent(log, true)
        if (!eventArgs) return log
        eventName = TRANSFER_EVENT_NAME
    }

    // TransferSingle
    if (log.topic0 === TRANSFER_SINGLE_TOPIC) {
        eventArgs = decodeTransferSingleEvent(log, true)
        if (!eventArgs) return log
        eventName = TRANSFER_SINGLE_EVENT_NAME
    }

    // TransferBatch
    if (log.topic0 === TRANSFER_BATCH_TOPIC) {
        eventArgs = decodeTransferBatchEvent(log, true)
        if (!eventArgs) return log
        eventName = TRANSFER_BATCH_EVENT_NAME
    }

    if (!eventName) return log

    log.eventName = eventName
    log.eventArgs = eventArgs as StringKeyMap[]

    return log
}

export function decodeTransferEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 4) return null
    
    let from, to, value
    try {
        from = normalizeEthAddress(topicsWithData[1], true, true)
        to = normalizeEthAddress(topicsWithData[2], true, true)
        value = hexToNumberString(topicsWithData[3])    
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_EVENT_NAME} event params: ${err}`)
        return null
    }

    if (formatAsEventArgs) {
        return [
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'value', type: 'uint256', value: value },
        ]
    }

    return { from, to, value }
}

export function decodeTransferSingleEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 6) return null
    
    let operator, from, to, id, value 
    try {
        operator = normalizeEthAddress(topicsWithData[1], true, true)
        from = normalizeEthAddress(topicsWithData[2], true, true)
        to = normalizeEthAddress(topicsWithData[3], true, true)
        id = hexToNumberString(topicsWithData[4])
        value = hexToNumberString(topicsWithData[5])
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_SINGLE_EVENT_NAME} event params: ${err}`)
        return null
    }

    if (formatAsEventArgs) {
        return [
            { name: 'operator', type: 'address', value: operator },
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'id', type: 'uint256', value: id },
            { name: 'value', type: 'uint256', value: value },
        ]
    }

    return { operator, from, to, id, value }
}

export function decodeTransferBatchEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const abiInputs = []
    for (let i = 0; i < BATCH_TRANSFER_INPUTS.length; i++) {
        abiInputs.push({ 
            ...BATCH_TRANSFER_INPUTS[i], 
            indexed: i < topics.length,
        })
    }

    let args
    try {
        args = web3.eth.abi.decodeLog(abiInputs as any, log.data, topics)
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_BATCH_EVENT_NAME} event params: ${err} for log`, log)
        return null
    }

    const numArgs = parseInt(args.__length__)
    const argValues = []
    for (let i = 0; i < numArgs; i++) {
        const stringIndex = i.toString()
        if (!args.hasOwnProperty(stringIndex)) continue
        argValues.push(args[stringIndex])
    }

    if (argValues.length !== abiInputs.length) {
        logger.error(`Length mismatch when parsing ${TRANSFER_BATCH_EVENT_NAME} event params: ${argValues}`)
        return null
    }
    
    const [operator, from, to, ids, values] = [
        normalizeEthAddress(argValues[0]),
        normalizeEthAddress(argValues[1]),
        normalizeEthAddress(argValues[2]),
        argValues[3] || [],
        argValues[4] || []
    ]

    if (formatAsEventArgs) {
        return [
            { name: 'operator', type: 'address', value: operator },
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'ids', type: 'uint256[]', value: ids },
            { name: 'values', type: 'uint256[]', value: values },
        ]
    }

    return { operator, from, to, ids, values }
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
    return Math.min(...blockNumbers.filter(n => n !== null)) || null
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
                )
            } catch (err) {
                logger.error(err)
                registrationJobUid && await contractRegistrationJobFailed(registrationJobUid, errors.GENERAL)
            }
        }
    }
}