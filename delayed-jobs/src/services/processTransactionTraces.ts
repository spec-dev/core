import {
    PolygonTraceType,
    normalizeEthAddress,
    hexToNumberString,
    PolygonTraceStatus,
    StringKeyMap,
    logger,
    PolygonCallType,
} from '../../../shared'

function processTransactionTraces(
    externalTrace: StringKeyMap,
    transactionHash: string,
    transactionIndex: number,
    blockNumber: number,
    blockHash: string,
    blockTimestamp: string,
): StringKeyMap[] {
    const traces = buildTracesFromCallStructure([externalTrace])
    for (let i = 0; i < traces.length; i++) {
        traces[i].id = `${traces[i].traceType}_${transactionHash}_ti_${i}`
        traces[i].transactionHash = transactionHash
        traces[i].transactionIndex = transactionIndex
        traces[i].blockHash = blockHash
        traces[i].blockNumber = blockNumber
        traces[i].blockTimestamp = blockTimestamp
        traces[i].traceIndex = i
        traces[i].traceIndexIsPerTx = true
    }
    return traces
}

function buildTracesFromCallStructure(
    callData: StringKeyMap[],
    traces: StringKeyMap[] = [], 
    parentTraceAddressList: number[] = [],
    parentTraceStatus?: PolygonTraceStatus,
) {
    for (let i = 0; i < callData.length; i++) {
        const externalTrace = (callData[i].result ? callData[i].result : callData[i])
        const trace = externalToInternalTrace(externalTrace, parentTraceAddressList, i, parentTraceStatus)
        if (!trace) continue
        traces.push(trace)

        if (externalTrace.calls?.length) {
            buildTracesFromCallStructure(externalTrace.calls, traces, trace.traceAddressList, trace.status)
        }
    }
    return traces
}

function externalToInternalTrace(
    externalTrace: StringKeyMap,
    parentTraceAddressList: number[],
    callIndex: number,
    parentTraceStatus?: PolygonTraceStatus,
): StringKeyMap | null {
    const trace: StringKeyMap = {}
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

export default processTransactionTraces