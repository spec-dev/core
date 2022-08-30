import {
    EthTrace,
    EthContract,
    EthTraceType,
    EthTraceStatus,
    normalizeEthAddress,
} from '../../../../../shared'

function getContracts(traces: EthTrace[]): EthContract[] {
    const contracts = []

    for (const trace of traces) {
        const address = normalizeEthAddress(trace.to)

        // Find all the successful contract creation traces.
        if (
            trace.traceType === EthTraceType.Create &&
            trace.status == EthTraceStatus.Success &&
            !!address
        ) {
            const contract = new EthContract()
            contract.address = address
            contract.bytecode = trace.output
            contract.blockHash = trace.blockHash
            contract.blockNumber = trace.blockNumber
            contract.blockTimestamp = trace.blockTimestamp
            contracts.push(contract)
        }
    }

    return contracts
}

export default getContracts
