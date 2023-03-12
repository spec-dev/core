import { ExternalPolygonTrace } from '../types'
import {
    PolygonTrace,
    PolygonTraceType,
    normalizeEthAddress,
    hexToNumberString,
    PolygonTraceStatus,
    StringKeyMap,
    logger,
    PolygonCallType,
} from '../../../../../shared'
import config from '../../../config'

export function externalToInternalTraces(
    externalTraceData: StringKeyMap[],
    blockNumber: number,
    blockHash: string,
    chainId: string
): PolygonTrace[] {
    if (!externalTraceData.length) return []
    const traces = buildTracesFromCallStructure(externalTraceData)
    setBlockScopedTraceIds(traces, blockNumber, blockHash)
    config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Formatted traces.`)
    return traces
}

export function buildTracesFromCallStructure(
    callData: StringKeyMap[],
    traces: PolygonTrace[] = [], 
    parentTraceAddressList: number[] = [],
    parentTraceStatus?: PolygonTraceStatus,
) {
    for (let i = 0; i < callData.length; i++) {
        const externalTrace = (callData[i].result ? callData[i].result : callData[i]) as ExternalPolygonTrace
        const trace = externalToInternalTrace(externalTrace, parentTraceAddressList, i, parentTraceStatus)
        if (!trace) continue
        traces.push(trace)

        if (externalTrace.calls?.length) {
            buildTracesFromCallStructure(externalTrace.calls, traces, trace.traceAddressList, trace.status)
        }
    }
    return traces
}

export function externalToInternalTrace(
    externalTrace: ExternalPolygonTrace,
    parentTraceAddressList: number[],
    callIndex: number,
    parentTraceStatus?: PolygonTraceStatus,
): PolygonTrace | null {
    const trace = new PolygonTrace()
    trace.to = normalizeEthAddress(externalTrace.to)
    trace.traceAddressList = [...parentTraceAddressList, callIndex]
    trace.traceAddress = trace.traceAddressList.join(',') || null
    trace.subtraces = externalTrace.calls?.length || 0
    trace.error = externalTrace.error || null

    if (parentTraceStatus === PolygonTraceStatus.Failure) {
        trace.status = PolygonTraceStatus.Failure
    } else {
        trace.status = !!trace.error ? PolygonTraceStatus.Failure : PolygonTraceStatus.Success
    }

    const givenType = externalTrace.type?.toLowerCase()
    switch (givenType) {
        case PolygonTraceType.Call:
            trace.traceType = PolygonTraceType.Call
            trace.callType = PolygonCallType.Call
            break
        case PolygonCallType.Delegatecall:
        case PolygonCallType.Staticcall:
        case PolygonCallType.Callcode:
            trace.traceType = PolygonTraceType.Call
            trace.callType = givenType as PolygonCallType
            break
        case PolygonTraceType.Create:
        case 'create2':
            trace.traceType = PolygonTraceType.Create
            break
        default:
            if (!givenType) {
                logger.error('Got trace with no type:', JSON.stringify(externalTrace, null, 4))
                return null
            }
            trace.traceType = givenType as PolygonTraceType
            break
    }

    // Common call/create properties.
    if (trace.traceType === PolygonTraceType.Call || trace.traceType === PolygonTraceType.Create) {
        trace.from = normalizeEthAddress(externalTrace.from)
        trace.value = hexToNumberString(externalTrace.value)
        trace.gas = hexToNumberString(externalTrace.gas)
        trace.gasUsed = hexToNumberString(externalTrace.gasUsed)
        trace.input = externalTrace.input
        trace.output = externalTrace.output
    }

    // Suicide
    else if (trace.traceType === PolygonTraceType.Suicide) {
        trace.from = normalizeEthAddress(externalTrace.from)
        trace.value = hexToNumberString(externalTrace.value)
    }

    // Reward
    else if (trace.traceType === PolygonTraceType.Reward) {
        trace.value = hexToNumberString(externalTrace.value)
    }

    return trace
}

function setBlockScopedTraceIds(traces: PolygonTrace[], blockNumber: number, blockHash: string) {
    // Group traces by type.
    const tracesByType: { [key: string]: PolygonTrace[] } = {}
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
        setTraceIdsForSingleType(typeGroups[i])
    }
}

function setTraceIdsForSingleType(traces: PolygonTrace[]) {
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