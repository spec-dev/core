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
} from '../../../shared'
import config from '../config'
import { ident } from 'pg-format'
import { camelizeKeys } from 'humps'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'

const web3 = new Web3()

const SAVE_BATCH_SIZE = 2000

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
    startBlock: number | null,
    queryRangeSize: number,
    jobRangeSize: number,
    finalEndBlock: number,
) {
    // Get map of contract abis.
    const abisMap = await getAbisForContracts(contractAddresses, chainId)
    if (!abisMap) return
    
    // Format tables to query based on chain-specific schema.
    const tables = buildTableRefsForChainId(chainId)

    // Determine the earliest block in which this contract was interacted with 
    // and use that as the "start" block if no start block was specified.
    startBlock = startBlock || await findStartBlock(tables, contractAddresses)
    if (startBlock === null) {
        logger.error(`No interactions with any of these contracts so far. Stopping.`)
        return
    }

    // Create connection pool.
    const pool = new Pool({
        host : config.SHARED_TABLES_DB_HOST,
        port : config.SHARED_TABLES_DB_PORT,
        user : config.SHARED_TABLES_DB_USERNAME,
        password : config.SHARED_TABLES_DB_PASSWORD,
        database : config.SHARED_TABLES_DB_NAME,
        max: config.SHARED_TABLES_MAX_POOL_SIZE,
        idleTimeoutMillis: 0,
        query_timeout: 0,
        connectionTimeoutMillis: 0,
        statement_timeout: 0,
    })
    pool.on('error', err => logger.error('PG client error', err))

    // Decode all transactions, traces, and logs that 
    // involve any of these contracts in this block range.
    const endCursor = await decodePrimitivesUsingContracts(
        chainId,
        contractAddresses,
        abisMap,
        tables,
        startBlock,
        queryRangeSize,
        jobRangeSize,
        finalEndBlock,
        pool,
    )

    await pool.end()

    // All contract interactions decoded.
    if (endCursor >= finalEndBlock) {
        logger.info(`Full decoded contract interactions (${contractAddresses.join(', ')})`)
        return
    }

    // Enqueue next job in series.
    await enqueueDelayedJob('decodeContractInteractions', {
        chainId, 
        contractAddresses,
        startBlock: endCursor,
        queryRangeSize,
        jobRangeSize,
        finalEndBlock,
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
    finalEndBlock: number,
    pool: Pool,
): Promise<number> {
    const onPolygon = [chainIds.POLYGON, chainIds.MUMBAI].includes(chainId)
    const stopAtBlock = Math.min(startBlock + jobRangeSize, finalEndBlock)
    const jobUid = short.generate()
    logger.info(`[${chainId}:${jobUid}] Decoding contracts ${startBlock} --> ${stopAtBlock}:\n${
        contractAddresses.map(address => `   - ${address}`).join('\n')
    }\n`)

    let batchTransactions = []
    let batchTraces = []
    let batchLogs = []
    let cursor = startBlock

    while (cursor < stopAtBlock) {
        const start = cursor
        const end = Math.min(cursor + queryRangeSize - 1, stopAtBlock)
        logger.info(`[${chainId}:${jobUid}] ${start} --> ${end}...`)
    
        let [transactions, traces, logs] = await Promise.all([
            decodeTransactions(start, end, contractAddresses, abisMap, tables),
            decodeTraces(start, end, contractAddresses, abisMap, tables),
            decodeLogs(start, end, contractAddresses, abisMap, tables),
        ])

        // If on Polygon, ensure all traces have been pulled for these transactions since 
        // we're lazy-loading traces on Polygon due to the lack of a `trace_block` RPC endpoint.
        if (onPolygon) {
            traces = await ensureTracesExistForEachTransaction(transactions, traces)
        }

        batchTransactions.push(...transactions)
        batchTraces.push(...traces)
        batchLogs.push(...logs)
        
        const saveTransactions = batchTransactions.length > SAVE_BATCH_SIZE
        const saveTraces = batchTraces.length > SAVE_BATCH_SIZE
        const saveLogs = batchLogs.length > SAVE_BATCH_SIZE

        const savePromises = []
        saveTransactions && savePromises.push(bulkSaveTransactions(transactions, tables.transactions, pool))
        saveTraces && savePromises.push(bulkSaveTraces(traces, tables.traces, pool))
        saveLogs && savePromises.push(bulkSaveLogs(logs, tables.logs, pool))
        await Promise.all(savePromises)

        if (saveTransactions) {
            batchTransactions = []
        }
        if (saveTraces) {
            batchTraces = []
        }
        if (saveLogs) {
            batchLogs = []
        }

        cursor = cursor + queryRangeSize
    }

    return cursor
}

async function ensureTracesExistForEachTransaction(
    transactions: StringKeyMap[],
    traces: StringKeyMap[],
): Promise<StringKeyMap[]> {
    return traces
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
        ['hash', 'input', 'to'],
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
    const logs = (await findContractLogsInBlockRange(
        tables.logs,
        startBlock,
        endBlock,
        contractAddresses,
    ))

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
            `select ${columns.map(ident).join(', ')} from ${table} where "to" in (${addressPlaceholders}) and "block_number" >= ${i + 1} and "block_number" <= ${i + 2}`,
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
            `select * from ${table} where "address" in (${addressPlaceholders}) and "block_number" >= ${i + 1} and "block_number" <= ${i + 2}`,
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
        if (log.address && log.topic0 && abis.hasOwnProperty(log.address)) {
            try {
                log = decodeLogEvent(log, abis[log.address])
            } catch (err) {
                logger.error(`Error decoding log for address ${log.address}: ${err}`)
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
    for (const input of abiItem.inputs || []) {
        input.name && argNames.push(input.name)
        argTypes.push(input.type)
    }
    if (argNames.length !== argTypes.length) {
        return log
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
        log.event_args = null
        logger.warn(
            `Log event args not stringifyable (transaction_hash=${log.transactionHash}, log_index=${log.logIndex})`
        )
    }
    return log
}

async function getAbisForContracts(contractAddresses: string[], chainId: string): Promise<StringKeyMap> {
    const abisMap = await getAbis(contractAddresses, chainId)
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
    const contractAddresses = params.contracts || []
    const startBlock = params.has('startBlock') ? params.startBlock : null
    const queryRangeSize = params.queryRangeSize || config.QUERY_BLOCK_RANGE_SIZE
    const jobRangeSize = params.jobRangeSize || config.JOB_BLOCK_RANGE_SIZE
    const finalEndBlock = params.finalEndBlock
    return {
        perform: async () => decodeContractInteractions(
            chainId, 
            contractAddresses, 
            startBlock,
            queryRangeSize,
            jobRangeSize,
            finalEndBlock,
        )
    }
}