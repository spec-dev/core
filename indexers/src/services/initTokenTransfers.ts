import { In, polygonToEthereumTokenMappings, TokenTransferStandard, hashSync, getNativeTokenForChain, ethereumToPolygonTokenMappings, chainIds, getLatestTokenPrices, NULL_ADDRESS, toChunks, SharedTables, Erc20Token, NftCollection, TokenTransfer, StringKeyMap, logger, unique, mapByKey } from '../../../shared'
import { 
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
} from '../utils/standardAbis'
import config from '../config'
import { getERC20TotalSupply } from './contractServices'
import { BigNumber, FixedNumber, utils } from 'ethers'

const erc20TokensRepo = () => SharedTables.getRepository(Erc20Token)
const nftCollectionsRepo = () => SharedTables.getRepository(NftCollection)

async function initTokenTransfers(
    newErc20Tokens: Erc20Token[],
    newNftCollections: NftCollection[],
    logs: StringKeyMap[],
    traces: StringKeyMap[],
    chainId: string,
): Promise<[TokenTransfer[], StringKeyMap[], StringKeyMap]> {
    const tokenTransfers = initNativeTokenTransfers(traces, chainId)
    const transferLogs = []
    const potentialErc20TokenAddressSet = new Set<string>()
    const potentialNftCollectionAddressSet = new Set<string>()

    for (const log of logs) {
        switch (log.topic0) {
            case TRANSFER_TOPIC: 
                transferLogs.push(log)
                potentialErc20TokenAddressSet.add(log.address)
                break
            case TRANSFER_SINGLE_TOPIC:
            case TRANSFER_BATCH_TOPIC:
                transferLogs.push(log)
                potentialNftCollectionAddressSet.add(log.address)
                break
            default:
                break
        }
    }
 
    const potentialErc20TokenAddresses = Array.from(potentialErc20TokenAddressSet)
    let potentialNftCollectionAddresses = Array.from(potentialNftCollectionAddressSet)
    potentialNftCollectionAddresses.push(...potentialErc20TokenAddresses)
    potentialNftCollectionAddresses = unique(potentialNftCollectionAddresses)

    const [erc20TokensMap, nftCollectionsMap] = await Promise.all([
        getErc20Tokens(potentialErc20TokenAddresses, chainId),
        getNftCollections(potentialNftCollectionAddresses, chainId),
    ])
    
    for (const newErc20Token of newErc20Tokens) {
        erc20TokensMap[newErc20Token.address] = newErc20Token
    }
    for (const newNftCollection of newNftCollections) {
        nftCollectionsMap[newNftCollection.address] = newNftCollection
    }

    for (const log of transferLogs) {
        const nftCollection = nftCollectionsMap[log.address]
        const erc20Token = erc20TokensMap[log.address]
        const eventArgs = log.eventArgs || []
        let fromAddress = null
        let toAddress = null
        let value = null
        let tokenId = null

        const { transactionHash, logIndex } = log
        let transferIndex = 0
        
        let tokenStandard, tokenModel
        if (nftCollection) {
            tokenModel = nftCollection
            tokenStandard = nftCollection.standard as TokenTransferStandard
        } else if (erc20Token) {
            tokenModel = erc20Token
            tokenStandard = TokenTransferStandard.ERC20
        } else {
            tokenModel = { address: log.address }
            tokenStandard = TokenTransferStandard.Unknown
        }

        // "Transfer"
        if (log.topic0 === TRANSFER_TOPIC) {
            fromAddress = eventArgs[0]?.value
            toAddress = eventArgs[1]?.value

            // NFT transfers.
            if (nftCollection) {
                tokenId = eventArgs[2]?.value || null
                if (tokenId === null) continue
                value = 1
            }
            // All others.
            else {
                value = eventArgs[2]?.value || null
                if (value === null) continue
            }
        }
        // "TransferSingle" (typically ERC-1155)
        else if (log.topic0 === TRANSFER_SINGLE_TOPIC) {
            fromAddress = eventArgs[1]?.value
            toAddress = eventArgs[2]?.value
            tokenId = eventArgs[3]?.value || null
            value = eventArgs[4]?.value || 1
            if (tokenId === null) continue
        }
        // "TransferBatch" (typically ERC-1155)
        else {
            fromAddress = eventArgs[1]?.value
            toAddress = eventArgs[2]?.value
            const tokenIds = eventArgs[3]?.value || []
            const values = eventArgs[4]?.value || []
            if (!tokenIds?.length || !values?.length || tokenIds.length !== values.length) continue

            const valueTokenIdPairs = []
            for (let i = 0; i < tokenIds.length; i++) {
                tokenId = tokenIds[i] || null
                value = values[i] || 1
                if (tokenId === null) continue
                valueTokenIdPairs.push({ value, tokenId })
            }

            for (let j = 0; j < valueTokenIdPairs.length; j++) {
                const pair = valueTokenIdPairs[j]
                transferIndex = j
                tokenTransfers.push(newTokenTransfer(
                    hashSync([chainId, transactionHash, logIndex, transferIndex].join(':')),
                    fromAddress,
                    toAddress,
                    pair.value,
                    log,
                    tokenModel,
                    tokenStandard,
                    pair.tokenId,
                    false,
                    chainId,
                ))
            }

            continue
        }

        tokenTransfers.push(newTokenTransfer(
            hashSync([chainId, transactionHash, logIndex, transferIndex].join(':')),
            fromAddress,
            toAddress,
            value,
            log,
            tokenModel,
            tokenStandard,
            tokenId,
            false,
            chainId,
        ))   
    }

    if (!tokenTransfers.length) {
        return [[], [], erc20TokensMap]
    }

    // Refetch the latest totalSupply on existing ERC-20 token contracts that were involved in a mint.
    const newErc20TokenAddresses = new Set(newErc20Tokens.map(t => t.address))
    const erc20TokenAddressesToRefetchTotalSupply = unique(
        tokenTransfers.filter(t => t.isMint && !!erc20TokensMap[t.tokenAddress]).map(t => t.tokenAddress)
    ).filter(address => !newErc20TokenAddresses.has(address))

    const refetchTotalSupplyAddressBatches = config.IS_RANGE_MODE 
        ? []
        : toChunks(erc20TokenAddressesToRefetchTotalSupply, 10)

    const erc20TokenTotalSupplyUpdates = []
    for (const batch of refetchTotalSupplyAddressBatches) {
        const batchValues = await Promise.all(batch.map(getERC20TotalSupply))
        for (let i = 0; i < batch.length; i++) {
            const address = batch[i]
            const totalSupply = batchValues[i]
            const erc20TokenId = erc20TokensMap[address]?.id
            totalSupply && erc20TokenId && erc20TokenTotalSupplyUpdates.push({ 
                id: erc20TokenId, 
                totalSupply,
            })
        }
    }

    // Only price token transfers on mainnets and when not in range mode.
    const onMainnet = [chainIds.ETHEREUM, chainIds.POLYGON].includes(chainId)
    if (!onMainnet || config.IS_RANGE_MODE) {
        return [tokenTransfers, erc20TokenTotalSupplyUpdates, erc20TokensMap]
    }

    const uniqueTokenTransferTokenAddresses = unique(tokenTransfers.map(t => t.tokenAddress))
    const tokenPriceCacheKeys = []
    for (const address of uniqueTokenTransferTokenAddresses) {
        const [ethereumKey, polygonKey] = getTokenPriceCacheKeys(chainId, address)
        ethereumKey && tokenPriceCacheKeys.push(ethereumKey)
        polygonKey && tokenPriceCacheKeys.push(polygonKey)
    }

    const tokenPrices = await getLatestTokenPrices(unique(tokenPriceCacheKeys))

    for (let i = 0; i < tokenTransfers.length; i++) {
        const transfer = tokenTransfers[i]
        // Don't price NFTs.
        if ([TokenTransferStandard.ERC721, TokenTransferStandard.ERC1155].includes(transfer.tokenStandard)) {
            continue
        }

        const [ethereumKey, polygonKey] = getTokenPriceCacheKeys(chainId, transfer.tokenAddress)
        const tokenPrice = tokenPrices[ethereumKey || ''] || tokenPrices[polygonKey || '']
        if (!tokenPrice || !transfer.tokenDecimals || !transfer.value) continue

        const decimals = Number(transfer.tokenDecimals)
        const { priceUsd, priceEth, priceMatic } = tokenPrice

        tokenTransfers[i].valueUsd = calculateTokenPrice(transfer.value, decimals, priceUsd) as any
        tokenTransfers[i].valueEth = calculateTokenPrice(transfer.value, decimals, priceEth) as any
        tokenTransfers[i].valueMatic = calculateTokenPrice(transfer.value, decimals, priceMatic) as any
    }

    return [tokenTransfers, erc20TokenTotalSupplyUpdates, erc20TokensMap]
}

function initNativeTokenTransfers(traces: StringKeyMap[], chainId: string): TokenTransfer[] {
    if (!traces.length) return []
    const nativeToken = getNativeTokenForChain(chainId)!
    return traces.filter(({ value }) => (
        value !== null && value.toString() !== '0'
    )).map(trace => newTokenTransfer( 
        hashSync([chainId, trace.id].join(':')),
        trace.from,
        trace.to,
        trace.value,
        trace,
        nativeToken,
        null,
        null,
        true,
        chainId,
    ))
}

function getTokenPriceCacheKeys(chainId: string, address: string): string[] {
    let ethereumAddress, polygonAddress
    if (chainId === chainIds.ETHEREUM) {
        ethereumAddress = address
        polygonAddress = ethereumToPolygonTokenMappings[address]
    } else {
        polygonAddress = address
        ethereumAddress = polygonToEthereumTokenMappings[address]
    }
    const ethereumKey = ethereumAddress ? [chainIds.ETHEREUM, ethereumAddress].join(':') : null
    const polygonKey = polygonAddress ? [chainIds.POLYGON, polygonAddress].join(':') : null
    return [ethereumKey, polygonKey]
}

export function calculateTokenPrice(value: string, decimals: number, pricePerToken: number): string | null {
    if (!pricePerToken) return null
    try {
        const decimalValue = FixedNumber.from(utils.formatUnits(BigNumber.from(value), decimals), decimals)
        const price = FixedNumber.from(pricePerToken.toFixed(decimals), decimals)
        const newValue = decimalValue.mulUnsafe(price)
        return newValue.toString()
    } catch (err) {
        logger.error(
            `Error calculating token price: ` + 
            `value=${value}, decimals=${decimals}, pricePerToken=${pricePerToken}: ` + 
            `${JSON.stringify(err)}`
        )
        return null
    }
}

function newTokenTransfer(
    transferId: string,
    fromAddress: string, 
    toAddress: string,
    value: any,
    sourceModel: StringKeyMap,
    tokenModel: StringKeyMap,
    tokenStandard: TokenTransferStandard | null,
    tokenId: string | null,
    isNative: boolean,
    chainId: string,
): TokenTransfer {
    const tokenTransfer = new TokenTransfer()
    tokenTransfer.transferId = transferId
    tokenTransfer.transactionHash = sourceModel.transactionHash
    tokenTransfer.logIndex = sourceModel.logIndex
    tokenTransfer.tokenAddress = tokenModel.address
    tokenTransfer.tokenName = tokenModel.name
    tokenTransfer.tokenSymbol = tokenModel.symbol
    tokenTransfer.tokenDecimals = tokenModel.decimals
    tokenTransfer.tokenStandard = tokenStandard
    tokenTransfer.tokenId = tokenId?.toString()
    tokenTransfer.fromAddress = fromAddress || NULL_ADDRESS
    tokenTransfer.toAddress = toAddress || NULL_ADDRESS
    tokenTransfer.isMint = !isNative && tokenTransfer.fromAddress === NULL_ADDRESS
    tokenTransfer.isNative = isNative
    tokenTransfer.value = value?.toString()
    tokenTransfer.valueUsd = null
    tokenTransfer.valueEth = null
    tokenTransfer.valueMatic = null
    tokenTransfer.blockHash = sourceModel.blockHash
    tokenTransfer.blockNumber = sourceModel.blockNumber
    tokenTransfer.blockTimestamp = sourceModel.blockTimestamp
    tokenTransfer.chainId = chainId
    return tokenTransfer
}

export async function getErc20Tokens(addresses: string[], chainId: string): Promise<StringKeyMap> {
    if (!addresses.length) return {}
    try {
        const records = (await erc20TokensRepo().find({
            select: { id: true, address: true, name: true, symbol: true, decimals: true },
            where: { address: In(addresses), chainId },
        })) || []
        return mapByKey(records, 'address')
    } catch (err) {
        logger.error(`Error querying erc20_tokens: ${err}`)
        return {}
    }
}

export async function getNftCollections(addresses: string[], chainId: string): Promise<StringKeyMap> {
    if (!addresses.length) return {}
    try {
        const records = (await nftCollectionsRepo().find({
            select: { address: true, name: true, symbol: true, standard: true },
            where: { address: In(addresses), chainId },
        })) || []
        return mapByKey(records, 'address')
    } catch (err) {
        logger.error(`Error querying nft_collections: ${err}`)
        return {}
    }
}

export default initTokenTransfers