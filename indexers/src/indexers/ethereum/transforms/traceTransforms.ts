import { ExternalEthTrace } from '../types'
import {
    EthTrace,
    EthTraceType,
    normalize32ByteHash,
    normalizeEthAddress,
    hexToNumberString,
    EthCallType,
    EthRewardType,
    EthTraceStatus,
    logger,
} from '../../../../../shared'
import config from '../../../config'

const GENESIS_BLOCK_NUMBER = 0
const DAOFORK_BLOCK_NUMBER = 1920000

export function externalToInternalTraces(
    externalTraces: ExternalEthTrace[],
    chainId: string
): EthTrace[] {
    if (!externalTraces.length) return []
    let specialTraces = []
    const blockNumber = externalTraces[0].blockNumber

    if (blockNumber === GENESIS_BLOCK_NUMBER) {
        specialTraces = getGenesisTraces()
    } else if (blockNumber === DAOFORK_BLOCK_NUMBER) {
        specialTraces = getDaoForkTraces()
    }

    const traces = [...specialTraces, ...externalTraces.map((t) => externalToInternalTrace(t))]

    // Calculate group-based properties.
    setTraceStatuses(traces)
    setTraceIds(traces)

    config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Formatted traces.`)

    return traces
}

function getGenesisTraces(): EthTrace[] {
    return []
}

function getDaoForkTraces(): EthTrace[] {
    return []
}

export function externalToInternalTrace(externalTrace: ExternalEthTrace): EthTrace {
    const trace = new EthTrace()
    trace.blockNumber = externalTrace.blockNumber
    trace.blockHash = externalTrace.blockHash
    trace.transactionHash = normalize32ByteHash(externalTrace.transactionHash)
    trace.transactionIndex = externalTrace.transactionPosition || null
    trace.traceAddressList = externalTrace.traceAddress || []
    trace.traceAddress = trace.traceAddressList.join(',') || null
    trace.subtraces = externalTrace.subtraces
    trace.error = externalTrace.error || null
    trace.traceType = externalTrace.type as EthTraceType
    const action = externalTrace.action || {}
    const result = externalTrace.result || {}

    // Common call/create properties.
    if (trace.traceType === EthTraceType.Call || trace.traceType === EthTraceType.Create) {
        trace.from = normalizeEthAddress(action.from)
        trace.value = hexToNumberString(action.value)
        trace.gas = hexToNumberString(action.gas)
        trace.gasUsed = hexToNumberString(result.gasUsed)
    }

    // Call
    if (trace.traceType === EthTraceType.Call) {
        trace.callType = action.callType as EthCallType
        trace.to = normalizeEthAddress(action.to)
        trace.input = action.input
        trace.output = result.output
    }

    // Create - New contract creation
    else if (trace.traceType === EthTraceType.Create) {
        trace.to = result.address
        trace.input = action.init
        trace.output = result.code
    }

    // Suicide
    else if (trace.traceType === EthTraceType.Suicide) {
        trace.from = normalizeEthAddress(action.address)
        trace.to = normalizeEthAddress(action.refundAddress)
        trace.value = hexToNumberString(action.balance)
    }

    // Reward
    else if (trace.traceType === EthTraceType.Reward) {
        trace.to = normalizeEthAddress(action.author)
        trace.value = hexToNumberString(action.value)
        trace.rewardType = action.rewardType as EthRewardType
    }

    return trace
}

function setTraceStatuses(traces: EthTrace[]) {
    // Default fallback status using 'error' property existence.
    let i
    for (i = 0; i < traces.length; i++) {
        traces[i].status = !!traces[i].error ? EthTraceStatus.Failure : EthTraceStatus.Success
    }

    // Group traces by transaction hash.
    const groupedTxTraces: { [key: string]: EthTrace[] } = {}
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
        setTransactionTraceStatuses(txTraceGroups[i])
    }
}

function setTransactionTraceStatuses(traces: EthTrace[]) {
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

        if (parentTrace.status === EthTraceStatus.Failure) {
            traces[i].status = EthTraceStatus.Failure
        }
    }
}

function setTraceIds(traces: EthTrace[]) {
    const blockScopedTraces = []

    let trace
    for (let i = 0; i < traces.length; i++) {
        trace = traces[i]

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

    setBlockScopedTraceIds(blockScopedTraces)
}

function setBlockScopedTraceIds(traces: EthTrace[]) {
    // Group traces by type.
    const tracesByType: { [key: string]: EthTrace[] } = {}
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
        setTraceIdsForSingleType(typeGroups[i])
    }
}

function setTraceIdsForSingleType(traces: EthTrace[]) {
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
