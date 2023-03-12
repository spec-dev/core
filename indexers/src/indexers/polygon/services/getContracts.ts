import {
    PolygonTrace,
    PolygonContract,
    PolygonTraceType,
    PolygonTraceStatus,
    normalizeEthAddress,
} from '../../../../../shared'
import { 
    isContractERC20,
    isContractERC721,
    isContractERC1155,
} from '../../../services/contractServices'

function getContracts(traces: PolygonTrace[]): PolygonContract[] {
    const contracts = []
    for (const trace of traces) {
        const address = normalizeEthAddress(trace.to)

        // Find all the successful contract creation traces.
        if (
            trace.traceType === PolygonTraceType.Create &&
            trace.status == PolygonTraceStatus.Success &&
            !!address
        ) {
            const contract = new PolygonContract()
            contract.address = address
            contract.bytecode = trace.output
            contract.isERC20 = trace.output ? isContractERC20(trace.output) : false
            contract.isERC721 = trace.output ? isContractERC721(trace.output) : false
            contract.isERC1155 = trace.output ? isContractERC1155(trace.output) : false
            contract.blockHash = trace.blockHash
            contract.blockNumber = trace.blockNumber
            contract.blockTimestamp = trace.blockTimestamp
            contracts.push(contract)
        }
    }
    return contracts
}

export default getContracts
