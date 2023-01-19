import { EthContract, StringKeyMap } from '../../../../../shared'

const eventName = 'eth.NewContracts@0.0.1'

function NewContracts(contracts: EthContract[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = contracts.map((contract) => ({
        address: contract.address,
        bytecode: contract.bytecode,
        isErc20: contract.isERC20,
        isErc721: contract.isERC721,
        isErc1155: contract.isERC1155,
        blockHash: contract.blockHash,
        blockNumber: Number(contract.blockNumber),
        blockTimestamp: contract.blockTimestamp.toISOString(),
    }))

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewContracts