import { ident } from 'pg-format'
import logger from '../logger'
import { Abi } from '../abi/types'
import { StringKeyMap } from '../types'
import { SharedTables } from '../shared-tables/db/dataSource'
import { Pool } from 'pg'
import config from '../config'
import short from 'short-uuid'
import { camelizeKeys } from 'humps'
import { sleep } from '../utils/time'
import { randomIntegerInRange } from '../utils/math'
import Web3 from 'web3'
import ChainTables from '../chain-tables/ChainTables'
import { specialErc20BalanceAffectingAbis } from '../utils/standardAbis'
import {
    TRANSFER_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_BATCH_EVENT_NAME,
    BATCH_TRANSFER_INPUTS,
} from '../utils/standardAbis'
import {
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    formatAbiValueWithType,
    splitLogDataToWords,
    normalizeEthAddress,
    hexToNumberString,
} from '../utils/formatters'

const web3 = new Web3()

export async function bulkSaveTransactions(
    schema: string,
    transactions: StringKeyMap[],
    table: string,
    log: boolean = false,
    shouldThrow: boolean = false,
    attempt: number = 1
) {
    if (!transactions?.length) return
    log && logger.info(`Saving ${transactions.length} decoded transactions...`)

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

    const insertQuery = `INSERT INTO ${tempTableName} (hash, function_name, function_args) VALUES ${insertPlaceholders.join(
        ', '
    )}`

    const client = await ChainTables.getConnection(schema)
    let error
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
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(err)
        error = err
    } finally {
        client.release()
    }
    if (!error) return

    const message = error.message || error.toString() || ''
    if (
        attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK &&
        message.toLowerCase().includes('deadlock')
    ) {
        logger.error(
            `Got deadlock updating ${table} with decoded data. Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`
        )
        await sleep(randomIntegerInRange(50, 500))
        return await bulkSaveTransactions(
            schema,
            transactions,
            table,
            log,
            shouldThrow,
            attempt + 1
        )
    }

    if (shouldThrow) throw error
}

export async function bulkSaveTraces(
    schema: string,
    traces: StringKeyMap[],
    table: string,
    log: boolean = false,
    shouldThrow: boolean = false,
    attempt: number = 1
) {
    if (!traces?.length) return
    log && logger.info(`Saving ${traces.length} decoded traces...`)

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
            functionOutputs =
                trace.functionOutputs === null ? null : JSON.stringify(trace.functionOutputs)
        } catch (e) {
            continue
        }
        insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
        insertBindings.push(...[trace.id, trace.functionName, functionArgs, functionOutputs])
        i += 4
    }
    const insertQuery = `INSERT INTO ${tempTableName} (id, function_name, function_args, function_outputs) VALUES ${insertPlaceholders.join(
        ', '
    )}`

    const client = await ChainTables.getConnection(schema)
    let error
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
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(err)
        error = err
    } finally {
        client.release()
    }
    if (!error) return

    const message = error.message || error.toString() || ''
    if (
        attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK &&
        message.toLowerCase().includes('deadlock')
    ) {
        logger.error(
            `Got deadlock updating ${table} with decoded data. Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`
        )
        await sleep(randomIntegerInRange(50, 500))
        return await bulkSaveTraces(schema, traces, table, log, shouldThrow, attempt + 1)
    }

    if (shouldThrow) throw error
}

export async function bulkSaveLogs(
    schema: string,
    logs: StringKeyMap[],
    table: string,
    log: boolean = false,
    shouldThrow: boolean = false,
    attempt: number = 1
) {
    if (!logs?.length) return
    log && logger.info(`Saving ${logs.length} decoded logs...`)

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

    const insertQuery = `INSERT INTO ${tempTableName} (log_index, transaction_hash, event_name, event_args) VALUES ${insertPlaceholders.join(
        ', '
    )}`

    const client = await ChainTables.getConnection(schema)
    let error
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
    } catch (err) {
        await client.query('ROLLBACK')
        logger.error(err)
        error = err
    } finally {
        client.release()
    }
    if (!error) return

    const message = error.message || error.toString() || ''
    if (
        attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK &&
        message.toLowerCase().includes('deadlock')
    ) {
        logger.error(
            `Got deadlock updating ${table} with decoded data. Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`
        )
        await sleep(randomIntegerInRange(50, 500))
        return await bulkSaveLogs(schema, logs, table, log, shouldThrow, attempt + 1)
    }

    if (shouldThrow) throw error
}

/**
 * Get all transactions sent *to* any of these contracts in this block range.
 */
export async function decodeTransactions(
    schema: string,
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
    includeDecodedResults?: boolean
): Promise<StringKeyMap[] | null> {
    const transactions = await findContractInteractionsInBlockRange(
        schema,
        tables.transactions,
        [
            'hash',
            'input',
            'to',
            'transaction_index',
            'block_number',
            'block_hash',
            'block_timestamp',
        ],
        startBlock,
        endBlock,
        contractAddresses,
        includeDecodedResults
    )
    if (transactions === null) return null

    if (includeDecodedResults) {
        transactions.forEach((tx) => {
            if (tx.functionName) {
                tx._alreadyDecoded = true
            }
        })
    }

    return decodeFunctionCalls(transactions, abisMap)
}

/**
 * Get all traces calls *to* any of these contracts in this block range.
 */
export async function decodeTraces(
    schema: string,
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
    includeDecodedResults?: boolean
): Promise<StringKeyMap[] | null> {
    return [] // hack

    const traces = await findContractInteractionsInBlockRange(
        schema,
        tables.traces,
        ['id', 'input', 'output', 'trace_type', 'to', 'transaction_hash'],
        startBlock,
        endBlock,
        contractAddresses,
        includeDecodedResults
    )
    if (traces === null) return null

    const calls = traces.filter((trace) => trace.traceType === 'call')

    if (includeDecodedResults) {
        calls.forEach((call) => {
            if (call.functionName) {
                call._alreadyDecoded = true
            }
        })
    }

    return decodeFunctionCalls(calls, abisMap)
}

/**
 * Get all logs emitted by any of these contracts in this block range.
 */
export async function decodeLogs(
    schema: string,
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    abisMap: StringKeyMap,
    tables: StringKeyMap,
    includeDecodedResults?: boolean
): Promise<StringKeyMap[] | null> {
    const logs = await findContractLogsInBlockRange(
        schema,
        tables.logs,
        startBlock,
        endBlock,
        contractAddresses,
        includeDecodedResults
    )
    if (logs === null) return null

    // NOTE: Commenting this out so that contracts with transfer events can "fix"
    // themselves from our previous decision where we were auto-converting the ZERO_ADDRESS into null.
    // if (includeDecodedResults) {
    //     logs.forEach((log) => {
    //         if (log.eventName) {
    //             log._alreadyDecoded = true
    //         }
    //     })
    // }

    return decodeLogEvents(logs, abisMap)
}

export async function findContractInteractionsInBlockRange(
    schema: string,
    table: string,
    columns: string[],
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    includeDecodedResults?: boolean
): Promise<StringKeyMap[] | null> {
    let i = 0
    const addressPlaceholders = contractAddresses
        .map(() => {
            i++
            return `$${i}`
        })
        .join(', ')

    const bindings = [...contractAddresses, startBlock]
    let suffixClause = `"block_number" = $${i + 1}`
    if (startBlock !== endBlock) {
        bindings.push(endBlock)
        suffixClause = `"block_number" >= $${i + 1} and "block_number" <= $${i + 2}`
    }

    if (!includeDecodedResults) {
        suffixClause += ' and "function_name" is null'
    }

    try {
        return camelizeKeys(
            (await ChainTables.query(
                schema,
                `select ${columns
                    .map(ident)
                    .join(
                        ', '
                    )} from ${table} where "to" in (${addressPlaceholders}) and ${suffixClause}`,
                bindings
            )) || []
        ) as StringKeyMap[]
    } catch (err) {
        logger.error(
            `Failed to query ${table} for block_number range (${startBlock} -> ${endBlock}): ${JSON.stringify(
                err
            )}`
        )
        return null
    }
}

export async function findContractLogsInBlockRange(
    schema: string,
    table: string,
    startBlock: number,
    endBlock: number,
    contractAddresses: string[],
    includeDecodedResults?: boolean
): Promise<StringKeyMap[] | null> {
    let i = 0
    const addressPlaceholders = contractAddresses
        .map(() => {
            i++
            return `$${i}`
        })
        .join(', ')

    const bindings = [...contractAddresses, startBlock]
    let suffixClause = `"block_number" = $${i + 1}`

    if (startBlock !== endBlock) {
        bindings.push(endBlock)
        suffixClause = `"block_number" >= $${i + 1} and "block_number" <= $${i + 2}`
    }

    if (!includeDecodedResults) {
        suffixClause += ' and "event_name" is null'
    }

    try {
        return camelizeKeys(
            (await ChainTables.query(
                schema,
                `select * from ${table} where "address" in (${addressPlaceholders}) and ${suffixClause}`,
                bindings
            )) || []
        ) as StringKeyMap[]
    } catch (err) {
        logger.error(
            `Failed to query ${table} for block_number range (${startBlock} -> ${endBlock}): ${JSON.stringify(
                err
            )}`
        )
        return null
    }
}

export function decodeFunctionCalls(
    records: StringKeyMap[],
    abisMap: { [key: string]: Abi }
): StringKeyMap[] {
    const final = []
    for (let record of records) {
        if (
            record.functionName ||
            !record.to ||
            !abisMap.hasOwnProperty(record.to) ||
            !record.input
        ) {
            final.push(record)
            continue
        }
        record = decodeFunctionCall(record, abisMap[record.to])
        final.push(record)
    }
    return records
}

export function decodeFunctionCall(record: StringKeyMap, abi: Abi): StringKeyMap {
    const inputSig = record.input?.slice(0, 10) || ''
    const inputData = record.input?.slice(10) || ''
    if (!inputSig) return record

    const abiItem = abi.find((item) => item.signature === inputSig)
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
    if (abiItem.outputs?.length && !!record.output && record.output.length > 2) {
        // 0x
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

export function decodeFunctionArgs(
    inputs: StringKeyMap[],
    inputData: string
): StringKeyMap[] | null {
    let functionArgs
    try {
        const inputsWithNames = ensureNamesExistOnAbiInputs(inputs)
        const values = web3.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
        functionArgs = groupAbiInputsWithValues(inputsWithNames, values)
    } catch (err) {
        if (
            err.reason?.includes('out-of-bounds') &&
            err.code === 'BUFFER_OVERRUN' &&
            inputData.length % 64 === 0 &&
            inputs.length > inputData.length / 64
        ) {
            const numInputsToUse = inputData.length / 64
            return decodeFunctionArgs(inputs.slice(0, numInputsToUse), inputData)
        }
        return null
    }
    return functionArgs || []
}

export function decodeLogEvents(
    logs: StringKeyMap[],
    abis: { [key: string]: Abi }
): StringKeyMap[] {
    const finalLogs = []
    for (let log of logs) {
        if (log.eventName) {
            finalLogs.push(log)
            continue
        }

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
                logger.warn(
                    `Error decoding log as transfer (address=${log.address}, topic0=${log.topic0}): ${err}`
                )
            }
        }

        // Try decoding with any special, non-standard, ERC-20 events that may affect balances.
        if (
            !log.eventName &&
            log.address &&
            log.topic0 &&
            log.topic1 &&
            specialErc20BalanceAffectingAbis[log.topic0]
        ) {
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

export function decodeLogEvent(log: StringKeyMap, abi: Abi): StringKeyMap {
    const abiItem = abi.find((item) => item.signature === log.topic0)
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

export function tryDecodingLogAsTransfer(log: StringKeyMap): StringKeyMap {
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
    formatAsEventArgs: boolean = false
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter((t) => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 4) return null

    let from, to, value
    try {
        from = normalizeEthAddress(topicsWithData[1], false, true)
        to = normalizeEthAddress(topicsWithData[2], false, true)
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
    formatAsEventArgs: boolean = false
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter((t) => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 6) return null

    let operator, from, to, id, value
    try {
        operator = normalizeEthAddress(topicsWithData[1], false, true)
        from = normalizeEthAddress(topicsWithData[2], false, true)
        to = normalizeEthAddress(topicsWithData[3], false, true)
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
    formatAsEventArgs: boolean = false
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic1, log.topic2, log.topic3].filter((t) => t !== null)
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
        logger.error(
            `Error extracting ${TRANSFER_BATCH_EVENT_NAME} event params: ${err} for log`,
            log
        )
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
        logger.error(
            `Length mismatch when parsing ${TRANSFER_BATCH_EVENT_NAME} event params: ${argValues}`
        )
        return null
    }

    const [operator, from, to, ids, values] = [
        normalizeEthAddress(argValues[0]),
        normalizeEthAddress(argValues[1]),
        normalizeEthAddress(argValues[2]),
        argValues[3] || [],
        argValues[4] || [],
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
