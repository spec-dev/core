import {
    EthTrace,
    EthContract,
    EthTraceType,
    EthTraceStatus,
    normalizeEthAddress,
} from '../../../../../shared'
import { 
    isContractERC20, 
    isContractERC721, 
    isContractERC1155,
} from '../../../services/contractServices'

function getContracts(traces: EthTrace[]): [EthContract[], EthTrace[]] {
    const contracts = []
    const contractCreationTraces = []

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
            contract.isERC20 = trace.output ? isContractERC20(trace.output) : null
            contract.isERC721 = trace.output ? isContractERC721(trace.output) : null
            contract.isERC1155 = trace.output ? isContractERC1155(trace.output) : null
            contract.blockHash = trace.blockHash
            contract.blockNumber = trace.blockNumber
            contract.blockTimestamp = trace.blockTimestamp
            contracts.push(contract)
            contractCreationTraces.push(trace)
        }
    }

    return [contracts, contractCreationTraces]
}

export default getContracts
