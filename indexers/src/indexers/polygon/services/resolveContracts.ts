import { StringKeyMap, getPolygonContracts, savePolygonContracts } from '../../../../../shared'
import { isContractERC20, resolveERC20Metadata, getContractBytecode } from '../../../services/contractServices'

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
    const cacheUpdates = {}
    for (let i = 0; i < bytecodes.length; i++) {
        const bytecode = bytecodes[i]
        if (!bytecode) continue
        const address = bytecodeAddresses[i]
        const contract = {
            address,
            bytecode,
            isERC20: isContractERC20(bytecode),
        }
        if (!contract.isERC20) {
            contracts[address] = contract
            cacheUpdates[address] = JSON.stringify(contract)
            continue
        }
        newERC20Contracts.push(contract)
    }

    const erc20Metadata = await Promise.all(
        newERC20Contracts.map(contract => resolveERC20Metadata(contract))
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
        cacheUpdates[address] = JSON.stringify(newERC20Contracts[i])
    }

    savePolygonContracts(cacheUpdates)

    return contracts
}

export default resolveContracts