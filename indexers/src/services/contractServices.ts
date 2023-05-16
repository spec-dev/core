import { getSocketWeb3 } from '../rpcPool'
import { StringKeyMap, logger, nullPromise, toChunks, Erc20Token, NftCollection, NftStandard, sleep, TokenTransfer, Erc20Balance, NftBalance, TokenTransferStandard, NULL_ADDRESS } from '../../../shared'
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

const errors = {
    EXECUTION_REVERTED: 'execution reverted',
    NUMERIC_FAULT: 'NUMERIC_FAULT',
}

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
    if (!web3) return null
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
    while (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
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
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return {}
            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                const switchAbi = message.includes(errors.NUMERIC_FAULT)
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
                    methods = getContractInterface(contract.address, newAbiItems) || {}
                    usingBytesAbi = true
                }
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }
            logger.error(
                `[${config.CHAIN_ID}] Error resolving ERC-20 contract metadata for ${contract.address}: ${message}`
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
    while (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
        numAttempts++
        try {
            const [name, symbol, totalSupply] = await Promise.all([
                sigs.has(ERC721_NAME_ITEM.signature) ? methods.name().call() : nullPromise(),
                sigs.has(ERC721_SYMBOL_ITEM.signature) ? methods.symbol().call() : nullPromise(),
                sigs.has(ERC721_TOTAL_SUPPLY_ITEM.signature) ? methods.totalSupply().call() : nullPromise(),
            ])
            return { name, symbol, totalSupply }
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return {}
            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                const switchAbi = message.includes(errors.NUMERIC_FAULT)
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
                    methods = getContractInterface(contract.address, newAbiItems) || {}
                    usingBytesAbi = true
                }
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }
            logger.error(
                `[${config.CHAIN_ID}] Error resolving NFT contract metadata for ${contract.address}: ${message}`
            )
            return {}
        }
    }
}

export async function getERC20TokenBalance(
    tokenAddress: string, 
    ownerAddress: string, 
    decimals: number | null,
    formatWithDecimals: boolean = true,
): Promise<string | null> {
    const isNative = tokenAddress === NULL_ADDRESS
    let fn: Function
    if (isNative) {
        fn = async () => {
            const web3 = getSocketWeb3()
            if (!web3) return null
            return web3.eth.getBalance(ownerAddress)
        }
    } else {
        fn = async () => {
            const methods = getContractInterface(tokenAddress, [ERC20_BALANCE_OF_ITEM])
            if (!methods) return null
            return methods.balanceOf(ownerAddress).call()
        }
    }

    let numAttempts = 0
    while (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
        numAttempts++
        try {
            let balance = await fn()
            if (!formatWithDecimals || !decimals) return balance
            balance = utils.formatUnits(BigNumber.from(balance || '0'), Number(decimals))
            return Number(balance) === 0 ? '0' : balance
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return null

            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }

            logger.error(`Error calling balanceOf(${ownerAddress}) on ERC-20 contract ${tokenAddress}: ${message}`)
            return null
        }
    }
}

export async function getERC20TotalSupply(tokenAddress: string): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC20_TOTAL_SUPPLY_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
        numAttempts++
        try {
            return await methods.totalSupply().call()
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return null

            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }

            logger.error(`Error calling totalSupply() on ERC-20 contract ${tokenAddress}: ${message}`)
            return null
        }
    }
}

export async function getDecimals(tokenAddress: string): Promise<string | null> {
    const methods = getContractInterface(tokenAddress, [ERC20_DECIMALS_ITEM])
    if (!methods) return null
    let numAttempts = 0
    while (numAttempts < 10) {
        numAttempts++
        try {
            return await methods.decimals().call()
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return null

            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }
            logger.error(`Error calling decimals() on ERC-20 contract ${tokenAddress}: ${message}`)
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
    while (numAttempts < 10) {
        numAttempts++
        try {
            let balance = await methods.balanceOf(ownerAddress, tokenId).call()
            return Number(balance) === 0 ? '0' : balance
        } catch (err) {
            const message = err.message || err.toString() || ''
            if (message.toLowerCase().includes(errors.EXECUTION_REVERTED)) return null

            if (numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                await sleep((config.EXPO_BACKOFF_FACTOR ** numAttempts) * 30)
                continue
            }

            logger.error(`Error calling balanceOf(${ownerAddress}, ${tokenId}) on ERC-1155 contract ${tokenAddress}: ${message}`)
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
        logger.error(`Error calling getCode(${address}): ${err}`)
        return null
    }
}

export async function getLatestTokenBalances(
    tokenTransfers: TokenTransfer[],
    specialErc20BalanceDataByOwner: StringKeyMap,
): Promise<[Erc20Balance[], NftBalance[]]> {
    // Extract the unique token:owner groups referenced by the transfers.
    let erc20BalanceDataByOwner = {}
    const nftBalanceDataByOwner = {}
    for (const transfer of tokenTransfers) {
        const { 
            tokenAddress, 
            tokenName,
            tokenSymbol,
            tokenDecimals,
            fromAddress, 
            toAddress, 
            tokenStandard,
            tokenId,
            isNative,
        } = transfer

        const ownerAddresses = [fromAddress, toAddress]
        if (isNative || tokenStandard === TokenTransferStandard.ERC20) {
            ownerAddresses.forEach(ownerAddress => {
                const uniqueKey = [tokenAddress, ownerAddress].join(':')
                erc20BalanceDataByOwner[uniqueKey] = {
                    tokenAddress,
                    ownerAddress,
                    tokenName,
                    tokenSymbol,
                    tokenDecimals,
                }
            })
            continue
        }
        
        const isNft = (
            tokenStandard === TokenTransferStandard.ERC721 || 
            tokenStandard === TokenTransferStandard.ERC1155
        )
        if (isNft) {
            ownerAddresses.forEach(ownerAddress => {
                const uniqueKey = [tokenAddress, ownerAddress, tokenId].join(':')
                nftBalanceDataByOwner[uniqueKey] = {
                    tokenAddress,
                    ownerAddress,
                    tokenId,
                    tokenName,
                    tokenSymbol,

                }
            })
            continue
        }
    }

    // Add in the special erc20 token owners for tokens that have 
    // events *other than Transfer* to signal balance changes.
    erc20BalanceDataByOwner = {
        ...erc20BalanceDataByOwner,
        ...specialErc20BalanceDataByOwner,
    }

    const erc20BalancesToRefetch = Object.values(erc20BalanceDataByOwner) as StringKeyMap[]
    const nftBalancesToRefetch = Object.values(nftBalanceDataByOwner) as StringKeyMap[]
    if (!erc20BalancesToRefetch.length && !nftBalancesToRefetch.length) {
        return [[], []]
    }
    
    const erc20BalanceGroups = toChunks(
        erc20BalancesToRefetch, 
        config.RPC_FUNCTION_BATCH_SIZE,
    )
    
    let erc20BalanceValues = []
    try {
        for (const group of erc20BalanceGroups) {
            erc20BalanceValues.push(...(await Promise.all(group.map(info => (
                getERC20TokenBalance(
                    info.tokenAddress, 
                    info.ownerAddress,
                    info.tokenDecimals,
                )
            )))))
        }    
    } catch (err) {
        logger.error(`Failed to fetch latest batch of ERC-20 balances: ${err}`)
        return [[], []]
    }

    const erc20Balances = []
    for (let i = 0; i < erc20BalancesToRefetch.length; i++) {
        const tokenOwnerInfo = erc20BalancesToRefetch[i]
        const balance = erc20BalanceValues[i]
        if (balance === null) continue
        const {
            tokenAddress,
            tokenName,
            tokenSymbol,
            tokenDecimals,
            ownerAddress,
        } = tokenOwnerInfo
        
        erc20Balances.push({
            tokenAddress,
            tokenName,
            tokenSymbol,
            tokenDecimals,
            ownerAddress,
            balance,
        })
    }

    return [erc20Balances as Erc20Balance[], []]
}