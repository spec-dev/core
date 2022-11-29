import { StringKeyMap, getPolygonContracts, savePolygonContracts } from '../../../../../shared'
import { isContractERC20, resolveERC20Metadata, getContractBytecode, isContractERC721, isContractERC1155, resolveNFTContractMetadata } from '../../../services/contractServices'

async function resolveContracts(addresses: string[]): Promise<StringKeyMap> {
    const contracts = await getPolygonContracts(addresses)

    let bytecodePromises = []
    let bytecodeAddresses = []
    for (const address of addresses) {
        if (contracts.hasOwnProperty(address)) continue
        bytecodeAddresses.push(address)
        bytecodePromises.push(getContractBytecode(address))
    }

    const bytecodes = await Promise.all(bytecodePromises)

    const newERC20Contracts = []
    const newERC721Contracts = []
    const newERC1155Contracts = []

    const cacheUpdates = {}
    for (let i = 0; i < bytecodes.length; i++) {
        const bytecode = bytecodes[i]
        if (!bytecode) continue

        const address = bytecodeAddresses[i]

        const contract = {
            address,
            bytecode,
            isERC20: isContractERC20(bytecode),
            isERC721: isContractERC721(bytecode),
            isERC1155: isContractERC1155(bytecode),
        }

        if (contract.isERC20) {
            newERC20Contracts.push(contract)
            continue
        }

        if (contract.isERC721) {
            newERC721Contracts.push(contract)
            continue
        }

        if (contract.isERC1155) {
            newERC1155Contracts.push(contract)
            continue
        }

        contracts[address] = contract

        cacheUpdates[address] = JSON.stringify({
            address,
            isERC20: false,
            isERC721: false,
            isERC1155: false,
        })
    }

    const erc20Metadata = await Promise.all(
        newERC20Contracts.map(contract => resolveERC20Metadata(contract))
    )
    const erc721Metadata = await Promise.all(
        newERC721Contracts.map(contract => resolveNFTContractMetadata(contract))
    )
    const erc1155Metadata = await Promise.all(
        newERC1155Contracts.map(contract => resolveNFTContractMetadata(contract))
    )

    for (let i = 0; i < newERC20Contracts.length; i++) {
        const address = newERC20Contracts[i].address
        const metadata = erc20Metadata[i] || {}
        const { name, symbol, decimals } = metadata

        if (name) {
            newERC20Contracts[i].name = name
        }
        if (symbol) {
            newERC20Contracts[i].symbol = symbol
        }
        if (decimals) {
            newERC20Contracts[i].decimals = Number(decimals)
        }
        
        contracts[address] = newERC20Contracts[i]
        cacheUpdates[address] = JSON.stringify({
            ...newERC20Contracts[i],
            bytecode: null,
        })
    }

    for (let i = 0; i < newERC721Contracts.length; i++) {
        const address = newERC721Contracts[i].address
        const metadata = erc721Metadata[i] || {}
        const { name, symbol } = metadata

        if (name) {
            newERC721Contracts[i].name = name
        }
        if (symbol) {
            newERC721Contracts[i].symbol = symbol
        }
        
        contracts[address] = newERC721Contracts[i]
        cacheUpdates[address] = JSON.stringify({
            ...newERC721Contracts[i],
            bytecode: null,
        })
    }

    for (let i = 0; i < newERC1155Contracts.length; i++) {
        const address = newERC1155Contracts[i].address
        const metadata = erc1155Metadata[i] || {}
        const { name, symbol } = metadata

        if (name) {
            newERC1155Contracts[i].name = name
        }
        if (symbol) {
            newERC1155Contracts[i].symbol = symbol
        }
        
        contracts[address] = newERC1155Contracts[i]
        cacheUpdates[address] = JSON.stringify({
            ...newERC1155Contracts[i],
            bytecode: null,
        })
    }

    savePolygonContracts(cacheUpdates)

    return contracts
}

export default resolveContracts