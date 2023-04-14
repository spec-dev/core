import { getSocketWeb3 } from '../providers'
import { StringKeyMap, logger, nullPromise, toChunks, Erc20Token, NftCollection, NftStandard, sleep } from '../../../shared'
import { selectorsFromBytecode } from '@shazow/whatsabi'
import { BigNumber, utils } from 'ethers'
import config from '../config'
import {
    ERC20_NAME_ITEM,
    ERC20_SYMBOL_ITEM,
    ERC20_DECIMALS_ITEM,
    ERC20_BALANCE_OF_ITEM,
    ERC20_TOTAL_SUPPLY_ITEM,
    ERC721_BALANCE_OF_ITEM,
    ERC721_OWNER_OF_ITEM,
    ERC721_TRANSFER_ITEM,
    ERC721_TRANSFER_FROM_ITEM,
    ERC721_APPROVE_ITEM,
    ERC721_NAME_ITEM,
    ERC721_SYMBOL_ITEM,
    ERC721_TOTAL_SUPPLY_ITEM,
    ERC1155_BALANCE_OF_ITEM,
    erc20RequiredFunctionItems,
    erc1155RequiredFunctionItems,
} from '../utils/standardAbis'

export async function resolveNewTokenContracts(
    contracts: StringKeyMap[],
    chainId: string,
): Promise<[Erc20Token[], NftCollection[]]> {
    const erc20Contracts = []
    const nftContracts = []
    for (const contract of contracts) {
        if (contract.isERC20) {
            erc20Contracts.push(contract)
        } else if (contract.isERC721 || contract.isERC1155) {
            nftContracts.push(contract)
        }
    }
    if (!erc20Contracts.length && !nftContracts.length) return [[], []]

    const erc20Batches = toChunks(erc20Contracts, 10)
    const erc20Tokens = []
    for (const batch of erc20Batches) {
        const batchERC20Tokens = await Promise.all(batch.map(c => newERC20Token(c, chainId)))
        erc20Tokens.push(...batchERC20Tokens)
    }

    const nftBatches = toChunks(nftContracts, 10)
    const nftCollections = []
    for (const batch of nftBatches) {
        const batchNFTTokens = await Promise.all(batch.map(c => newNFTCollection(c, chainId)))
        nftCollections.push(...batchNFTTokens)
    }

    return [erc20Tokens, nftCollections]
}

async function newERC20Token(contract: StringKeyMap, chainId: string): Promise<Erc20Token> {
    const token = new Erc20Token()
    token.address = contract.address
    token.blockHash = contract.blockHash
    token.blockNumber = contract.blockNumber
    token.blockTimestamp = contract.blockTimestamp
    token.lastUpdated = contract.blockTimestamp
    token.chainId = chainId

    const metadata = await resolveERC20Metadata(contract)
    token.name = parseTokenString(metadata.name)
    token.symbol = parseTokenString(metadata.symbol)
    token.decimals = metadata.decimals
    token.totalSupply = metadata.totalSupply

    return token
}

function parseTokenString(value: string): string | null {
    if (!value) return null
    try {
        return JSON.stringify(value).includes('\\') ? null : value
    } catch (e) {
        return null
    }
}

async function newNFTCollection(contract: StringKeyMap, chainId: string): Promise<NftCollection> {
    const collection = new NftCollection()

    if (contract.isERC721) {
        collection.standard = NftStandard.ERC721
    } else if (contract.isERC1155) {
        collection.standard = NftStandard.ERC1155
    } else {
        collection.standard = NftStandard.Unknown
    }

    collection.address = contract.address
    collection.blockHash = contract.blockHash
    collection.blockNumber = contract.blockNumber
    collection.blockTimestamp = contract.blockTimestamp
    collection.lastUpdated = contract.blockTimestamp
    collection.chainId = chainId

    const metadata = await resolveNFTContractMetadata(contract)
    collection.name = parseTokenString(metadata.name)
    collection.symbol = parseTokenString(metadata.symbol)
    collection.totalSupply = metadata.totalSupply

    return collection
}

export function getContractInterface(address: string, abi: any): StringKeyMap | null {
    const web3 = getSocketWeb3()
    if (!web3) return {}
    try {
        const contract = new web3.eth.Contract(abi, address)
        return contract.methods    
    } catch (err) {
        logger.error(`Error gettingContractInterface for ${address}`, err)
        return null
    }
}

export function isContractERC20(bytecode?: string, functionSignatures?: string[]): boolean {
    functionSignatures = functionSignatures?.length ? functionSignatures : bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures?.length) return false
    const sigs = new Set(functionSignatures)
    const implementedFunctions = erc20RequiredFunctionItems.filter(item => sigs.has(item.signature))
    return implementedFunctions.length === erc20RequiredFunctionItems.length
}

export function isContractERC721(bytecode?: string, functionSignatures?: string[]): boolean {
    functionSignatures = functionSignatures?.length ? functionSignatures : bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures?.length) return false
    const sigs = new Set(functionSignatures)
    return sigs.has(ERC721_BALANCE_OF_ITEM.signature) && 
        sigs.has(ERC721_OWNER_OF_ITEM.signature) &&
        sigs.has(ERC721_APPROVE_ITEM.signature) &&
        (sigs.has(ERC721_TRANSFER_ITEM.signature) || sigs.has(ERC721_TRANSFER_FROM_ITEM.signature))
}

export function isContractERC1155(bytecode?: string, functionSignatures?: string[]): boolean {
    functionSignatures = functionSignatures?.length ? functionSignatures : bytecodeToFunctionSignatures(bytecode)
    if (!functionSignatures?.length) return false
    const sigs = new Set(functionSignatures)
    const implementedFunctions = erc1155RequiredFunctionItems.filter(item => sigs.has(item.signature))
    return implementedFunctions.length / erc1155RequiredFunctionItems.length > 0.8
}

export function bytecodeToFunctionSignatures(bytecode: string): string[] | null {
    if (!bytecode) return null
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
    if (!functionSignatures?.length) return {}

    const abiItems = []
    const sigs = new Set(functionSignatures)
    sigs.has(ERC20_NAME_ITEM.signature) && abiItems.push(ERC20_NAME_ITEM)
    sigs.has(ERC20_SYMBOL_ITEM.signature) && abiItems.push(ERC20_SYMBOL_ITEM)
    sigs.has(ERC20_DECIMALS_ITEM.signature) && abiItems.push(ERC20_DECIMALS_ITEM)
    sigs.has(ERC20_TOTAL_SUPPLY_ITEM.signature) && abiItems.push(ERC20_TOTAL_SUPPLY_ITEM)
    if (!abiItems.length) return {}

    let methods = getContractInterface(contract.address, abiItems)
    if (!methods) return {}
    let usingBytesAbi = false

    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                sigs.has(ERC20_NAME_ITEM.signature) ? methods.name().call() : nullPromise(),
                sigs.has(ERC20_SYMBOL_ITEM.signature) ? methods.symbol().call() : nullPromise(),
                sigs.has(ERC20_DECIMALS_ITEM.signature) ? methods.decimals().call() : nullPromise(),
                sigs.has(ERC20_TOTAL_SUPPLY_ITEM.signature) ? methods.totalSupply().call() : nullPromise(),
            ])
            return { name, symbol, decimals, totalSupply }
        } catch (err) {
            const error = JSON.stringify(err)
            if (numAttempts < 5) {
                const switchAbi = error.includes('NUMERIC_FAULT')
                if (switchAbi && !usingBytesAbi) {
                    const newAbiItems = []
                    sigs.has(ERC20_NAME_ITEM.signature) && newAbiItems.push({ 
                        ...ERC20_NAME_ITEM, 
                        outputs: [{ name: '', type: 'bytes32' }] 
                    })
                    sigs.has(ERC20_SYMBOL_ITEM.signature) && newAbiItems.push({ 
                        ...ERC20_SYMBOL_ITEM,
                        outputs: [{ name: '', type: 'bytes32' }] 
                    })
                    sigs.has(ERC20_DECIMALS_ITEM.signature) && newAbiItems.push(ERC20_DECIMALS_ITEM)
                    sigs.has(ERC20_TOTAL_SUPPLY_ITEM.signature) && newAbiItems.push(ERC20_TOTAL_SUPPLY_ITEM)
                    methods = getContractInterface(contract.address, newAbiItems)
                    usingBytesAbi = true
                }
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(
                `[${config.CHAIN_ID}] Error resolving ERC-20 contract metadata for ${contract.address}: ${error}`
            )
            return {}
        }    
    }
}

export async function resolveNFTContractMetadata(contract: StringKeyMap): Promise<StringKeyMap> {
    const functionSignatures = bytecodeToFunctionSignatures(contract.bytecode)
    if (!functionSignatures?.length) return {}

    const abiItems = []
    const sigs = new Set(functionSignatures)
    sigs.has(ERC721_NAME_ITEM.signature) && abiItems.push(ERC721_NAME_ITEM)
    sigs.has(ERC721_SYMBOL_ITEM.signature) && abiItems.push(ERC721_SYMBOL_ITEM)
    sigs.has(ERC721_TOTAL_SUPPLY_ITEM.signature) && abiItems.push(ERC721_TOTAL_SUPPLY_ITEM)
    if (!abiItems.length) return {}

    let methods = getContractInterface(contract.address, abiItems)
    if (!methods) return {}
    let usingBytesAbi = false

    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            const [name, symbol, totalSupply] = await Promise.all([
                sigs.has(ERC721_NAME_ITEM.signature) ? methods.name().call() : nullPromise(),
                sigs.has(ERC721_SYMBOL_ITEM.signature) ? methods.symbol().call() : nullPromise(),
                sigs.has(ERC721_TOTAL_SUPPLY_ITEM.signature) ? methods.totalSupply().call() : nullPromise(),
            ])
            return { name, symbol, totalSupply }
        } catch (err) {
            const error = JSON.stringify(err)
            if (numAttempts < 5) {
                const switchAbi = error.includes('NUMERIC_FAULT')
                if (switchAbi && !usingBytesAbi) {
                    const newAbiItems = []
                    sigs.has(ERC721_NAME_ITEM.signature) && newAbiItems.push({ 
                        ...ERC721_NAME_ITEM, 
                        outputs: [{ name: '', type: 'bytes32' }] 
                    })
                    sigs.has(ERC721_SYMBOL_ITEM.signature) && newAbiItems.push({ 
                        ...ERC721_SYMBOL_ITEM,
                        outputs: [{ name: '', type: 'bytes32' }] 
                    })
                    sigs.has(ERC20_DECIMALS_ITEM.signature) && newAbiItems.push(ERC20_DECIMALS_ITEM)
                    sigs.has(ERC20_TOTAL_SUPPLY_ITEM.signature) && newAbiItems.push(ERC20_TOTAL_SUPPLY_ITEM)
                    methods = getContractInterface(contract.address, newAbiItems)
                    usingBytesAbi = true
                }
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(
                `[${config.CHAIN_ID}] Error resolving NFT contract metadata for ${contract.address}: ${error}`
            )
            return {}
        }
    }
}

export async function getERC20TokenBalance(
    tokenAddress: string, 
    ownerAddress: string, 
    decimals: number = 18,
    formatWithDecimals: boolean = true,
): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC20_BALANCE_OF_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            let balance = await methods.balanceOf(ownerAddress).call()
            if (!formatWithDecimals) return balance
            balance = utils.formatUnits(BigNumber.from(balance || '0'), Number(decimals) || 18)
            return Number(balance) === 0 ? '0' : balance
        } catch (err) {
            if (numAttempts < 5) {
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(`Error calling balanceOf(${ownerAddress}) on ERC-20 contract ${tokenAddress}: ${JSON.stringify(err)}`)
            return null
        }
    }
}

export async function getERC20TotalSupply(tokenAddress: string): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC20_TOTAL_SUPPLY_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            return await methods.totalSupply().call()
        } catch (err) {
            if (numAttempts < 5) {
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(`Error calling totalSupply() on ERC-20 contract ${tokenAddress}: ${JSON.stringify(err)}`)
            return null
        }
    }
}

export async function getDecimals(tokenAddress: string): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC20_DECIMALS_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            return await methods.decimals().call()
        } catch (err) {
            if (numAttempts < 5) {
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(`Error calling decimals() on ERC-20 contract ${tokenAddress}: ${JSON.stringify(err)}`)
            return null
        }
    }
}

export async function getERC1155TokenBalance(
    tokenAddress: string,
    tokenId: string,
    ownerAddress: string, 
): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC1155_BALANCE_OF_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < 5) {
        numAttempts++
        try {
            let balance = await methods.balanceOf(ownerAddress, tokenId).call()
            return Number(balance) === 0 ? '0' : balance
        } catch (err) {
            if (numAttempts < 5) {
                await sleep((1.5 ** numAttempts) * 10)
                continue
            }
            logger.error(`Error calling balanceOf(${ownerAddress}, ${tokenId}) on ERC-1155 contract ${tokenAddress}: ${JSON.stringify(err)}`)
            return null
        }
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