import { 
    ExternalEvmBlock, 
    ExternalEvmTransaction, 
    ExternalEvmLog, 
    ExternalEvmParityTrace,
    ExternalEvmDebugTrace,
} from './types'
import { 
    normalizeEthAddress,
    normalize32ByteHash,
    hexToNumber,
    toString,
    hexToNumberString,
    normalizeByteData,
} from '../../utils/formatters'
import { unixTimestampToDate } from '../../utils/date'
import { EvmBlock } from '../../shared-tables/db/entities/EvmBlock'
import { EvmTransaction } from '../../shared-tables/db/entities/EvmTransaction'
import { EvmLog } from '../../shared-tables/db/entities/EvmLog'
import { EvmTrace, EvmTraceType, EvmCallType, EvmRewardType, EvmTraceStatus } from '../../shared-tables/db/entities/EvmTrace'
import { StringKeyMap } from '../../types'
import logger from '../../logger'

/**
 * Blocks
 */
export function externalToInternalBlock(
    externalBlock: ExternalEvmBlock,
): {
    block: EvmBlock,
    transactions: EvmTransaction[],
    unixTimestamp: number,
} {
    const block = new EvmBlock()
    block.number = externalBlock.number
    block.hash = externalBlock.hash
    block.parentHash = normalize32ByteHash(externalBlock.parentHash)
    block.nonce = externalBlock.nonce
    block.sha3Uncles = normalize32ByteHash(externalBlock.sha3Uncles)
    block.logsBloom = normalizeByteData(externalBlock.logsBloom)
    block.transactionsRoot = normalize32ByteHash(externalBlock.transactionsRoot)
    block.stateRoot = normalize32ByteHash(externalBlock.stateRoot)
    block.receiptsRoot = normalize32ByteHash(externalBlock.receiptsRoot)
    block.miner = normalizeEthAddress(externalBlock.miner)
    block.difficulty = externalBlock.difficulty
    block.totalDifficulty = externalBlock.totalDifficulty
    block.size = externalBlock.size
    block.extraData = normalizeByteData(externalBlock.extraData)
    block.gasLimit = toString(externalBlock.gasLimit) || null
    block.gasUsed = toString(externalBlock.gasUsed) || null
    block.baseFeePerGas = toString(externalBlock.baseFeePerGas) || null
    externalBlock.transactions = externalBlock.transactions || []
    block.transactionCount = externalBlock.transactions.length || 0
    block.timestamp = unixTimestampToDate(externalBlock.timestamp)
    return {
        block,
        transactions: externalBlock.transactions.map(tx => externalToInternalTransaction(tx, block)),
        unixTimestamp: externalBlock.timestamp,
    }
}

/**
 * Transactions
 */
export function externalToInternalTransaction(
    externalTransaction: ExternalEvmTransaction,
    block?: EvmBlock
): EvmTransaction {
    const transaction = new EvmTransaction()
    transaction.hash = externalTransaction.hash
    transaction.nonce = externalTransaction.nonce
    transaction.transactionIndex = externalTransaction.transactionIndex
    transaction.from = normalizeEthAddress(externalTransaction.from)
    transaction.to = normalizeEthAddress(externalTransaction.to)
    transaction.contractAddress = null
    transaction.value = externalTransaction.value
    transaction.input = normalizeByteData(externalTransaction.input)
    transaction.functionName = null
    transaction.functionArgs = null
    transaction.transactionType = externalTransaction.type
    transaction.status = null
    transaction.root = null
    transaction.gas = toString(externalTransaction.gas) || null
    transaction.gasPrice = externalTransaction.gasPrice
    transaction.maxFeePerGas = externalTransaction.maxFeePerGas
    transaction.maxPriorityFeePerGas = externalTransaction.maxPriorityFeePerGas
    transaction.gasUsed = null
    transaction.cumulativeGasUsed = null
    transaction.effectiveGasPrice = null
    transaction.blockHash = block?.hash
    transaction.blockNumber = block?.number
    transaction.blockTimestamp = block?.timestamp
    return transaction
}

/**
 * Logs
 */
export function externalToInternalLog(
    externalLog: ExternalEvmLog, 
    block?: EvmBlock
): EvmLog {
    const topics = externalLog.topics || []
    const log = new EvmLog()
    log.logIndex = hexToNumber(externalLog.logIndex)
    log.transactionHash = externalLog.transactionHash
    log.transactionIndex = hexToNumber(externalLog.transactionIndex)
    log.address = normalizeEthAddress(externalLog.address)
    log.data = normalizeByteData(externalLog.data)
    log.topic0 = topics[0] || null
    log.topic1 = topics[1] || null
    log.topic2 = topics[2] || null
    log.topic3 = topics[3] || null
    log.eventName = null
    log.eventArgs = null
    log.blockHash = block?.hash
    log.blockNumber = block?.number
    log.blockTimestamp = block?.timestamp
    log.removed = externalLog.removed
    return log
}

/**
 * Parity Traces
 */
const GENESIS_BLOCK_NUMBER = 0
const DAOFORK_BLOCK_NUMBER = 1920000

export function externalToInternalParityTraces(
    externalTraces: ExternalEvmParityTrace[],
): EvmTrace[] {
    if (!externalTraces.length) return []
    let specialTraces = []
    const blockNumber = externalTraces[0].blockNumber

    // TODO: Hardcode these somewhere.
    if (blockNumber == GENESIS_BLOCK_NUMBER) {
        specialTraces = getGenesisTraces()
    } else if (blockNumber == DAOFORK_BLOCK_NUMBER) {
        specialTraces = getDaoForkTraces()
    }

    const traces = [
        ...specialTraces, 
        ...externalTraces.map((t) => externalToInternalParityTrace(t)),
    ]

    // Calculate group-based properties.
    setParityTraceStatuses(traces)
    setParityTraceIds(traces)

    return traces
}

function getGenesisTraces(): EvmTrace[] {
    return []
}

function getDaoForkTraces(): EvmTrace[] {
    return []
}

export function externalToInternalParityTrace(externalTrace: ExternalEvmParityTrace): EvmTrace {
    const trace = new EvmTrace()
    trace.blockNumber = externalTrace.blockNumber
    trace.blockHash = externalTrace.blockHash
    trace.transactionHash = normalize32ByteHash(externalTrace.transactionHash)
    trace.transactionIndex = externalTrace.transactionPosition || null
    trace.traceAddressList = externalTrace.traceAddress || []
    trace.traceAddress = trace.traceAddressList.join(',') || null
    trace.subtraces = externalTrace.subtraces
    trace.error = externalTrace.error || null
    trace.traceType = externalTrace.type as EvmTraceType
    const action = externalTrace.action || {}
    const result = externalTrace.result || {}

    // Common call/create properties.
    if (trace.traceType === EvmTraceType.Call || trace.traceType === EvmTraceType.Create) {
        trace.from = normalizeEthAddress(action.from)
        trace.value = hexToNumberString(action.value)
        trace.gas = hexToNumberString(action.gas)
        trace.gasUsed = hexToNumberString(result.gasUsed)
    }

    // Call
    if (trace.traceType === EvmTraceType.Call) {
        trace.callType = action.callType as EvmCallType
        trace.to = normalizeEthAddress(action.to)
        trace.input = action.input
        trace.output = result.output
    }

    // Create - New contract creation
    else if (trace.traceType === EvmTraceType.Create) {
        trace.to = result.address
        trace.input = action.init
        trace.output = result.code
    }

    // Suicide
    else if (trace.traceType === EvmTraceType.Suicide) {
        trace.from = normalizeEthAddress(action.address)
        trace.to = normalizeEthAddress(action.refundAddress)
        trace.value = hexToNumberString(action.balance)
    }

    // Reward
    else if (trace.traceType === EvmTraceType.Reward) {
        trace.to = normalizeEthAddress(action.author)
        trace.value = hexToNumberString(action.value)
        trace.rewardType = action.rewardType as EvmRewardType
    }

    return trace
}

function setParityTraceStatuses(traces: EvmTrace[]) {
    // Default fallback status using 'error' property existence.
    let i
    for (i = 0; i < traces.length; i++) {
        traces[i].status = !!traces[i].error ? EvmTraceStatus.Failure : EvmTraceStatus.Success
    }

    // Group traces by transaction hash.
    const groupedTxTraces: { [key: string]: EvmTrace[] } = {}
    let txHash
    for (i = 0; i < traces.length; i++) {
        txHash = traces[i].transactionHash
        if (!txHash) continue
        if (!groupedTxTraces.hasOwnProperty(txHash)) {
            groupedTxTraces[txHash] = []
        }
        groupedTxTraces[txHash].push(traces[i])
    }

    // Calculate statuses for each transaction.
    const txTraceGroups = Object.values(groupedTxTraces)
    for (i = 0; i < txTraceGroups.length; i++) {
        setTransactionParityTraceStatuses(txTraceGroups[i])
    }
}

function setTransactionParityTraceStatuses(traces: EvmTrace[]) {
    // Sort by number of items in trace address.
    traces.sort((a, b) => a.traceAddressList.length - b.traceAddressList.length)

    let i
    // Group by trace address.
    const tracesByTraceAddress = {}
    for (i = 0; i < traces.length; i++) {
        tracesByTraceAddress[traces[i].traceAddress || ''] = traces[i]
    }

    // Set any child traces to failed if their parent trace failed.
    let parentTrace, traceAddressList
    for (i = 0; i < traces.length; i++) {
        traceAddressList = traces[i].traceAddressList
        if (traceAddressList.length === 0) continue
        parentTrace =
            tracesByTraceAddress[traceAddressList.slice(0, traceAddressList.length - 1).join(',')]

        if (!parentTrace) {
            logger.error(
                `A parent trace for trace with trace_address ${traces[i].traceAddress} in 
                transaction ${traces[i].transactionHash} was not found.`
            )
            return
        }

        if (parentTrace.status === EvmTraceStatus.Failure) {
            traces[i].status = EvmTraceStatus.Failure
        }
    }
}

function setParityTraceIds(traces: EvmTrace[]) {
    const blockScopedTraces = []

    let trace
    for (let i = 0; i < traces.length; i++) {
        trace = traces[i]
        traces[i].traceIndex = i

        // Tx-scoped trace id:
        // --> {trace_type}_{transaction_hash}_{trace_address}
        if (trace.transactionHash) {
            traces[i].id = `${trace.traceType}_${
                trace.transactionHash
            }_${trace.traceAddressList.join('_')}`
        }

        // Block-scoped trace id:
        // --> {trace_type}_{block_hash}_{index_within_block}
        else {
            blockScopedTraces.push(traces[i])
        }
    }

    setBlockScopedParityTraceIds(blockScopedTraces)
}

function setBlockScopedParityTraceIds(traces: EvmTrace[]) {
    // Group traces by type.
    const tracesByType: { [key: string]: EvmTrace[] } = {}
    let i, traceType
    for (i = 0; i < traces.length; i++) {
        traceType = traces[i].traceType
        if (!tracesByType.hasOwnProperty(traceType)) {
            tracesByType[traceType] = []
        }
        tracesByType[traceType].push(traces[i])
    }

    // Calculate trace ids for each type group.
    const typeGroups = Object.values(tracesByType)
    for (i = 0; i < typeGroups.length; i++) {
        setParityTraceIdsForSingleType(typeGroups[i])
    }
}

function setParityTraceIdsForSingleType(traces: EvmTrace[]) {
    traces.sort(
        (a, b) =>
            (a.rewardType || '').localeCompare(b.rewardType || '') ||
            (a.from || '').localeCompare(b.from || '') ||
            (a.to || '').localeCompare(b.to || '') ||
            Number(BigInt(a.value || 0) - BigInt(b.value || 0))
    )

    for (let i = 0; i < traces.length; i++) {
        traces[i].id = `${traces[i].traceType}_${traces[i].blockHash}_${i}`
    }
}

/**
 * Debug Traces
 */
 export function externalToInternalDebugTraces(
    externalTraceData: StringKeyMap[],
    blockNumber: number,
    blockHash: string,
): EvmTrace[] {
    if (!externalTraceData.length) return []
    const traces = buildDebugTracesFromCallStructure(externalTraceData)
    setBlockScopedDebugTraceIds(traces, blockNumber, blockHash)
    return traces
}

export function buildDebugTracesFromCallStructure(
    callData: StringKeyMap[],
    traces: EvmTrace[] = [],
    parentTraceAddressList: number[] = [],
    parentTraceStatus?: EvmTraceStatus,
) {
    for (let i = 0; i < callData.length; i++) {
        const externalTrace = (callData[i].result ? callData[i].result : callData[i]) as ExternalEvmDebugTrace
        const trace = externalToInternalDebugTrace(externalTrace, parentTraceAddressList, i, parentTraceStatus)
        if (!trace) continue
        traces.push(trace)

        if (externalTrace.calls?.length) {
            buildDebugTracesFromCallStructure(externalTrace.calls, traces, trace.traceAddressList, trace.status)
        }
    }
    return traces
}

export function externalToInternalDebugTrace(
    externalTrace: ExternalEvmDebugTrace,
    parentTraceAddressList: number[],
    callIndex: number,
    parentTraceStatus?: EvmTraceStatus,
): EvmTrace | null {
    const trace = new EvmTrace()
    trace.to = normalizeEthAddress(externalTrace.to)
    trace.traceAddressList = [...parentTraceAddressList, callIndex]
    trace.traceAddress = trace.traceAddressList.join(',') || null
    trace.subtraces = externalTrace.calls?.length || 0
    trace.error = externalTrace.error || null

    if (parentTraceStatus === EvmTraceStatus.Failure) {
        trace.status = EvmTraceStatus.Failure
    } else {
        trace.status = !!trace.error ? EvmTraceStatus.Failure : EvmTraceStatus.Success
    }

    const givenType = externalTrace.type?.toLowerCase()
    switch (givenType) {
        case EvmTraceType.Call:
            trace.traceType = EvmTraceType.Call
            trace.callType = EvmCallType.Call
            break
        case EvmCallType.Delegatecall:
        case EvmCallType.Staticcall:
        case EvmCallType.Callcode:
            trace.traceType = EvmTraceType.Call
            trace.callType = givenType as EvmCallType
            break
        case EvmTraceType.Create:
        case 'create2':
            trace.traceType = EvmTraceType.Create
            break
        default:
            if (!givenType) {
                logger.error('Got trace with no type:', JSON.stringify(externalTrace, null, 4))
                return null
            }
            trace.traceType = givenType as EvmTraceType
            break
    }

    // Common call/create properties.
    if (trace.traceType === EvmTraceType.Call || trace.traceType === EvmTraceType.Create) {
        trace.from = normalizeEthAddress(externalTrace.from)
        trace.value = hexToNumberString(externalTrace.value)
        trace.gas = hexToNumberString(externalTrace.gas)
        trace.gasUsed = hexToNumberString(externalTrace.gasUsed)
        trace.input = externalTrace.input
        trace.output = externalTrace.output
    }

    // Suicide
    else if (trace.traceType === EvmTraceType.Suicide) {
        trace.from = normalizeEthAddress(externalTrace.from)
        trace.value = hexToNumberString(externalTrace.value)
    }

    // Reward
    else if (trace.traceType === EvmTraceType.Reward) {
        trace.value = hexToNumberString(externalTrace.value)
    }

    return trace
}

function setBlockScopedDebugTraceIds(traces: EvmTrace[], blockNumber: number, blockHash: string) {
    // Group traces by type.
    const tracesByType: { [key: string]: EvmTrace[] } = {}
    let i, traceType
    for (i = 0; i < traces.length; i++) {
        traces[i].blockHash = blockHash
        traces[i].blockNumber = blockNumber
        traces[i].traceIndex = i
        traceType = traces[i].traceType
        if (!tracesByType.hasOwnProperty(traceType)) {
            tracesByType[traceType] = []
        }
        tracesByType[traceType].push(traces[i])
    }

    // Calculate trace ids for each type group.
    const typeGroups = Object.values(tracesByType)
    for (i = 0; i < typeGroups.length; i++) {
        setDebugTraceIdsForSingleType(typeGroups[i])
    }
}

function setDebugTraceIdsForSingleType(traces: EvmTrace[]) {
    traces.sort(
        (a, b) =>
            (a.from || '').localeCompare(b.from || '') ||
            (a.to || '').localeCompare(b.to || '') ||
            Number(BigInt(a.value || 0) - BigInt(b.value || 0))
    )

    for (let i = 0; i < traces.length; i++) {
        traces[i].id = `${traces[i].traceType}_${traces[i].blockHash}_${i}`
    }
}