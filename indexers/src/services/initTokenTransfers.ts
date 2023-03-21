import { In, polygonToEthereumTokenMappings, ethereumToPolygonTokenMappings, chainIds, getLatestTokenPrices, NULL_ADDRESS, toChunks, SharedTables, Erc20Token, NftCollection, Erc20Transfer, NftTransfer, StringKeyMap, logger, unique, mapByKey } from '../../../shared'
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
    chainId: string,
): Promise<[Erc20Transfer[], NftTransfer[], StringKeyMap[]]> {
    if (!logs.length) return [[], [], []]
    const transferLogs = []
    const erc1155TransferLogs = []
    const potentialTokenAddressSet = new Set<string>()
    const potentialNftCollectionAddressSet = new Set<string>()

    for (const log of logs) {
        switch (log.topic0) {
            case TRANSFER_TOPIC: 
                transferLogs.push(log)
                potentialTokenAddressSet.add(log.address)
                break
            case TRANSFER_SINGLE_TOPIC:
            case TRANSFER_BATCH_TOPIC:
                erc1155TransferLogs.push(log)
                potentialNftCollectionAddressSet.add(log.address)
                break
            default:
                break
        }
    }

    const potentialTokenAddresses = Array.from(potentialTokenAddressSet)
    let potentialNftCollectionAddresses = Array.from(potentialNftCollectionAddressSet)
    potentialNftCollectionAddresses.push(...potentialTokenAddresses)
    potentialNftCollectionAddresses = unique(potentialNftCollectionAddresses)

    const [erc20TokensMap, nftCollectionsMap] = await Promise.all([
        getErc20Tokens(potentialTokenAddresses, chainId),
        getNftCollections(potentialNftCollectionAddresses, chainId),
    ])
    
    for (const newErc20Token of newErc20Tokens) {
        erc20TokensMap[newErc20Token.address] = newErc20Token
    }
    for (const newNftCollection of newNftCollections) {
        nftCollectionsMap[newNftCollection.address] = newNftCollection
    }

    const nftTransferLogs = []
    for (const log of erc1155TransferLogs) {
        const nftCollection = nftCollectionsMap[log.address]
        if (!nftCollection) continue
        nftTransferLogs.push({ log, nftCollection })
    }

    const erc20Transfers = []
    for (const log of transferLogs) {
        const nftCollection = nftCollectionsMap[log.address]
        if (nftCollection) {
            nftTransferLogs.push({ log, nftCollection })
            continue
        }
        const erc20Token = erc20TokensMap[log.address]
        if (erc20Token) {
            const eventArgs = log.eventArgs || []
            const fromAddress = eventArgs[0]?.value
            const toAddress = eventArgs[1]?.value
            const value = eventArgs[2]?.value || null
            if (value === null) continue
            erc20Transfers.push(newErc20Transfer(
                fromAddress, 
                toAddress,
                value,
                log,
                erc20Token, 
                chainId,
            ))
            continue
        }
    }    

    const nftTransfers = []
    for (const nftTransferLog of nftTransferLogs) {
        const { log, nftCollection } = nftTransferLog

        if (log.topic0 === TRANSFER_TOPIC) {
            const eventArgs = log.eventArgs || []
            const fromAddress = eventArgs[0]?.value
            const toAddress = eventArgs[1]?.value
            const tokenId = eventArgs[2]?.value || null
            const value = null
            if (tokenId === null) continue
            nftTransfers.push(newNftTransfer(
                fromAddress, 
                toAddress, 
                tokenId, 
                value,
                log,
                0,
                nftCollection, 
                chainId,
            ))
        }
        else if (log.topic0 === TRANSFER_SINGLE_TOPIC) {
            const eventArgs = log.eventArgs || []
            const fromAddress = eventArgs[1]?.value
            const toAddress = eventArgs[2]?.value
            const tokenId = eventArgs[3]?.value || null
            const value = eventArgs[4]?.value || null
            if (tokenId === null) continue
            nftTransfers.push(newNftTransfer(
                fromAddress, 
                toAddress, 
                tokenId,
                value,
                log,
                0,
                nftCollection, 
                chainId,
            ))
        }
        else if (log.topic0 === TRANSFER_BATCH_TOPIC) {
            const eventArgs = log.eventArgs || []
            const fromAddress = eventArgs[1]?.value
            const toAddress = eventArgs[2]?.value
            const tokenIds = eventArgs[3]?.value || []
            const values = eventArgs[4]?.value || []
            if (!tokenIds?.length || !values?.length || tokenIds.length !== values.length) continue

            for (let i = 0; i < tokenIds.length; i++) {
                const tokenId = tokenIds[i] || null
                const value = values[i] || null
                if (tokenId === null) continue
                nftTransfers.push(newNftTransfer(
                    fromAddress, 
                    toAddress, 
                    tokenId, 
                    value, 
                    log,
                    i,
                    nftCollection,
                    chainId,
                ))
            }
        }
    }

    if (!erc20Transfers.length) {
        return [erc20Transfers, nftTransfers, []]
    }

    // Refetch the latest totalSupply on existing token contracts that were used to mint.
    const newErc20TokenAddresses = new Set(newErc20Tokens.map(t => t.address))
    const erc20TokenAddressesToRefetchTotalSupply = unique(
        erc20Transfers.filter(t => t.isMint).map(t => t.tokenAddress)
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
            if (!totalSupply) continue
            const erc20TokenId = erc20TokensMap[address]?.id
            if (!erc20TokenId) continue
            erc20TokenTotalSupplyUpdates.push({ id: erc20TokenId, totalSupply })
        }
    }

    // Only price token transfers when on mainnets.
    if (![chainIds.ETHEREUM, chainIds.POLYGON].includes(chainId)) {
        return [erc20Transfers, nftTransfers, erc20TokenTotalSupplyUpdates]
    }

    const uniqueErc20TransferTokenAddresses = unique(erc20Transfers.map(t => t.tokenAddress))
    const tokenPriceCacheKeys = []
    for (const address of uniqueErc20TransferTokenAddresses) {
        const [ethereumKey, polygonKey] = getTokenPriceCacheKeys(chainId, address)
        ethereumKey && tokenPriceCacheKeys.push(ethereumKey)
        polygonKey && tokenPriceCacheKeys.push(polygonKey)
    }

    const tokenPrices = await getLatestTokenPrices(unique(tokenPriceCacheKeys))

    for (let i = 0; i < erc20Transfers.length; i++) {
        const transfer = erc20Transfers[i]
        const [ethereumKey, polygonKey] = getTokenPriceCacheKeys(chainId, transfer.tokenAddress)
        const tokenPrice = tokenPrices[ethereumKey || ''] || tokenPrices[polygonKey || '']
        if (!tokenPrice) continue

        const value = transfer.value
        const decimals = Number(transfer.tokenDecimals || 18)
        const { priceUsd, priceEth, priceMatic } = tokenPrice

        erc20Transfers[i].valueUsd = calculateTokenPrice(value, decimals, priceUsd)
        erc20Transfers[i].valueEth = calculateTokenPrice(value, decimals, priceEth)
        erc20Transfers[i].valueMatic = calculateTokenPrice(value, decimals, priceMatic)
    }

    return [erc20Transfers, nftTransfers, erc20TokenTotalSupplyUpdates]
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
        const decimalValue = FixedNumber.from(utils.formatUnits(BigNumber.from(value), decimals))
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

function newErc20Transfer(
    fromAddress: string, 
    toAddress: string,
    value: any,
    log: StringKeyMap,
    erc20Token: Erc20Token,
    chainId: string,
): Erc20Transfer {
    const erc20Transfer = new Erc20Transfer()
    erc20Transfer.transactionHash = log.transactionHash
    erc20Transfer.logIndex = log.logIndex
    erc20Transfer.tokenAddress = erc20Token.address
    erc20Transfer.tokenName = erc20Token.name
    erc20Transfer.tokenSymbol = erc20Token.symbol
    erc20Transfer.tokenDecimals = erc20Token.decimals
    erc20Transfer.fromAddress = fromAddress || NULL_ADDRESS
    erc20Transfer.toAddress = toAddress || NULL_ADDRESS
    erc20Transfer.isMint = erc20Transfer.fromAddress === NULL_ADDRESS
    erc20Transfer.value = value.toString()
    erc20Transfer.valueUsd = null
    erc20Transfer.valueEth = null
    erc20Transfer.valueMatic = null
    erc20Transfer.blockHash = log.blockHash
    erc20Transfer.blockNumber = log.blockNumber
    erc20Transfer.blockTimestamp = log.blockTimestamp
    erc20Transfer.chainId = chainId
    return erc20Transfer
}

function newNftTransfer(
    fromAddress: string, 
    toAddress: string,
    tokenId: any,
    value: any,
    log: StringKeyMap,
    transferIndex: number,
    nftCollection: NftCollection,
    chainId: string,
): NftTransfer {
    const nftTransfer = new NftTransfer()
    nftTransfer.transactionHash = log.transactionHash
    nftTransfer.logIndex = log.logIndex
    nftTransfer.transferIndex = transferIndex
    nftTransfer.tokenAddress = nftCollection.address
    nftTransfer.tokenName = nftCollection.name
    nftTransfer.tokenSymbol = nftCollection.symbol
    nftTransfer.tokenStandard = nftCollection.standard
    nftTransfer.fromAddress = fromAddress || NULL_ADDRESS
    nftTransfer.toAddress = toAddress || NULL_ADDRESS
    nftTransfer.isMint = nftTransfer.fromAddress === NULL_ADDRESS
    nftTransfer.tokenId = tokenId.toString()
    nftTransfer.value = value === null ? '1' : value.toString()
    nftTransfer.blockHash = log.blockHash
    nftTransfer.blockNumber = log.blockNumber
    nftTransfer.blockTimestamp = log.blockTimestamp
    nftTransfer.chainId = chainId
    return nftTransfer
}

async function getErc20Tokens(addresses: string[], chainId: string): Promise<StringKeyMap> {
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

async function getNftCollections(addresses: string[], chainId: string): Promise<StringKeyMap> {
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