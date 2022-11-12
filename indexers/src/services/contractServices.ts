import { getSocketWeb3 } from '../providers'
import { StringKeyMap, logger, nullPromise } from '../../../shared'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import { BigNumber, utils } from 'ethers'
import {
    ERC20_NAME_ITEM,
    ERC20_SYMBOL_ITEM,
    ERC20_DECIMALS_ITEM,
    ERC20_BALANCE_OF_ITEM,
    ERC721_BALANCE_OF_ITEM,
    ERC721_OWNER_OF_ITEM,
    ERC721_TRANSFER_ITEM,
    ERC721_TRANSFER_FROM_ITEM,
    ERC721_APPROVE_ITEM,
    erc20RequiredFunctionItems,
    erc1155RequiredFunctionItems,
} from '../utils/standardAbis'

export function getContractInterface(address: string, abi: any): StringKeyMap {
    const web3 = getSocketWeb3()
    if (!web3) return {}
    const contract = new web3.eth.Contract(abi, address)
    return contract.methods
}

export function isContractERC20(bytecode: string): boolean {
    const functionSignatures = bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures.length) return false
    const sigs = new Set(functionSignatures)
    const implementedFunctions = erc20RequiredFunctionItems.filter(item => sigs.has(item.signature))
    return implementedFunctions.length === erc20RequiredFunctionItems.length
}

export function isContractERC721(bytecode: string): boolean {
    const functionSignatures = bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures.length) return false
    const sigs = new Set(functionSignatures)
    return sigs.has(ERC721_BALANCE_OF_ITEM.signature) && 
        sigs.has(ERC721_OWNER_OF_ITEM.signature) &&
        sigs.has(ERC721_APPROVE_ITEM.signature) &&
        (sigs.has(ERC721_TRANSFER_ITEM.signature) || sigs.has(ERC721_TRANSFER_FROM_ITEM.signature))
}

export function isContractERC1155(bytecode: string): boolean {
    const functionSignatures = bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures.length) return false
    const sigs = new Set(functionSignatures)
    const implementedFunctions = erc1155RequiredFunctionItems.filter(item => sigs.has(item.signature))
    return implementedFunctions.length === erc1155RequiredFunctionItems.length
}

export function bytecodeToFunctionSignatures(bytecode: string): string[] {
    let functionSignatures
    try {
        functionSignatures = selectorsFromBytecode(bytecode)
    } catch (err) {
        logger.error(
            `Error extracting function signatures from bytecode: ${err}`
        )
        return null
    }
    return functionSignatures || []
}

export async function resolveERC20Metadata(contract: StringKeyMap): Promise<StringKeyMap> {
    const functionSignatures = bytecodeToFunctionSignatures(contract.bytecode)
    if (!functionSignatures.length) return {}

    const abiItems = []
    const sigs = new Set(functionSignatures)
    sigs.has(ERC20_NAME_ITEM.signature) && abiItems.push(ERC20_NAME_ITEM)
    sigs.has(ERC20_SYMBOL_ITEM.signature) && abiItems.push(ERC20_SYMBOL_ITEM)
    sigs.has(ERC20_DECIMALS_ITEM.signature) && abiItems.push(ERC20_DECIMALS_ITEM)
    if (!abiItems.length) return {}

    const methods = getContractInterface(contract.address, abiItems)
    try {
        const [name, symbol, decimals] = await Promise.all([
            sigs.has(ERC20_NAME_ITEM.signature) ? methods.name().call() : nullPromise(),
            sigs.has(ERC20_SYMBOL_ITEM.signature) ? methods.symbol().call() : nullPromise(),
            sigs.has(ERC20_DECIMALS_ITEM.signature) ? methods.decimals().call() : nullPromise(),
        ])
        return { name, symbol, decimals }
    } catch (err) {
        logger.error(err)
        return {}
    }
}

export async function getERC20TokenBalance(
    tokenAddress: string, 
    ownerAddress: string, 
    decimals: number = 18,
    formatWithDecimals: boolean = true,
): Promise<string> {
    const methods = getContractInterface(tokenAddress, [ERC20_BALANCE_OF_ITEM])

    try {
        let balance = await methods.balanceOf(ownerAddress).call()
        if (!formatWithDecimals) return balance

        balance = utils.formatUnits(BigNumber.from(balance || '0'), Number(decimals) || 18)
        return Number(balance) === 0 ? '0' : balance
    } catch (err) {
        return null
    }
}

export async function getContractBytecode(address: string): Promise<string> {
    const web3 = getSocketWeb3()
    if (!web3) return null
    try {
        return await web3.eth.getCode(address)
    } catch (err) {
        return null
    }
}