import cmcIds from './cmcIds'
import { NULL_ADDRESS, StringKeyMap, logger, sleep, toChunks, chainIds, getLatestTokenPrices, setLatestTokenPrices, TokenPrice, SharedTables } from '../../../../shared'
import config from '../../config'
import fetch from 'cross-fetch'

const ETHEREUM_CMC_ID = 1027
const POLYGON_CMC_ID = 3890
const BATCH_SIZE = 700

const chainIdForPlatform = {
    [ETHEREUM_CMC_ID]: chainIds.ETHEREUM,
    [POLYGON_CMC_ID]: chainIds.POLYGON,
}

const buildUrl = (ids: number[]): string => {
    const url = new URL('https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest')
    url.searchParams.append('id', ids.join(','))
    return url.href
}

async function pollTokenPrices() {
    // Get the latest token prices mapped by id.
    const quotes = await fetchTokenPrices()
    
    // Get ETH/USD.
    const ethToUsd = quotes[ETHEREUM_CMC_ID.toString()]?.quote?.USD?.price
    if (!ethToUsd) {
        logger.error('Failed to pull latest ETH/USD price.')
        return
    }

    // Get MATIC/USD.
    const maticToUsd = quotes[POLYGON_CMC_ID.toString()]?.quote?.USD?.price
    if (!maticToUsd) {
        logger.error('Failed to pull latest MATIC/USD price.')
        return
    }

    // Format all tokens and assign 'priceUsd', 'priceEth', 'priceMatic'.
    const [pricedTokens, latestTimestamp] = buildPricedTokens(
        Object.values(quotes), 
        ethToUsd, 
        maticToUsd,
    )

    // Get previous prices from redis.
    const prevPrices = await getLatestTokenPrices()
    
    // Filter tokens by those that have changed.
    const pricedTokensThatChanged = diffTokenPrices(pricedTokens, prevPrices)
    if (!pricedTokensThatChanged.length) {
        logger.info('No token price changes.')
        return
    }

    logger.info(`Prices changed for ${pricedTokensThatChanged.length}/${pricedTokens.length} tokens.`)

    // Save latest token prices to shared tables.
    if (!(await saveTokenPrices(pricedTokensThatChanged, latestTimestamp))) return

    // Cache latest prices in redis.
    await cacheLatestPrices(pricedTokensThatChanged)

    logger.info('Token prices up to date.')
}

async function saveTokenPrices(pricedTokens: StringKeyMap[], latestTimestamp: Date): Promise<boolean> {
    const recordsToSave = pricedTokens.filter(t => new Date(t.timestamp) >= latestTimestamp)
    logger.info(`Saving ${recordsToSave.length} token prices...`)
    
    try {
        // NOTE: To enable this again, make sure TokenPrice is actually 
        // included as one of the entites of SharedTables and the table actually exists...
        await SharedTables.manager.transaction(async (tx) => {
            await tx
                .createQueryBuilder()
                .insert()
                .into(TokenPrice)
                .values(recordsToSave)
                .execute()
        })
        return true
    } catch (err) {
        logger.error(`Error saving token prices: ${JSON.stringify(err)}`)
        return false
    }
}

async function cacheLatestPrices(pricedTokens: StringKeyMap[]) {
    logger.info(`Caching latest token prices...`)
    const cacheData = {}
    for (const token of pricedTokens) {
        const { tokenAddress, chainId } = token
        const cacheKey = [chainId, tokenAddress].join(':')
        try {
            cacheData[cacheKey] = JSON.stringify(token)
        } catch (err) {
            logger.error(`Error stringifying token for redis`, token)
        }
    }
    await setLatestTokenPrices(cacheData)
}

function diffTokenPrices(
    pricedTokens: StringKeyMap[],
    prevPrices: StringKeyMap,
): StringKeyMap[] {
    return pricedTokens.filter(token => {
        const {
            tokenAddress,
            chainId,
            priceUsd,
            priceEth,
            priceMatic,
        } = token
        const cacheKey = [chainId, tokenAddress].join(':')
        const prevPriceData = prevPrices[cacheKey]
        return !prevPriceData ||
            priceUsd !== prevPriceData.priceUsd || 
            priceEth !== prevPriceData.priceEth || 
            priceMatic !== prevPriceData.priceMatic
    })
}

function buildPricedTokens(
    tokenPrices: StringKeyMap[],
    ethToUsd: number,
    maticToUsd: number,
): [StringKeyMap[], Date] {
    const pricedTokens = []

    let maxDate = null
    for (const tokenData of tokenPrices) {
        let chainId, tokenAddress
        if (tokenData.id === ETHEREUM_CMC_ID) {
            tokenAddress = NULL_ADDRESS
            chainId = chainIds.ETHEREUM
        } else if (tokenData.id === POLYGON_CMC_ID) {
            tokenAddress = NULL_ADDRESS
            chainId = chainIds.POLYGON
        }

        tokenAddress = tokenAddress || tokenData.platform?.token_address?.toLowerCase()
        if (!tokenAddress) {
            logger.error('Token address not given for token', tokenData)
            continue
        }

        chainId = chainId || chainIdForPlatform[tokenData.platform?.id]
        if (!chainId) {
            logger.error('Supported chain not determined for token', tokenData)
            continue
        }

        const priceUsd = tokenData.quote?.USD?.price
        if (!priceUsd) {
            logger.error('USD quote not given for token', tokenData)
            continue
        }

        const priceEth = priceUsd / ethToUsd
        const priceMatic = priceUsd / maticToUsd

        pricedTokens.push({
            tokenName: tokenData.name,
            tokenSymbol: tokenData.symbol,
            tokenAddress,
            priceUsd,
            priceEth,
            priceMatic,
            timestamp: tokenData.last_updated,
            chainId,
        })

        const lastUpdatedDate = new Date(tokenData.last_updated)
        if (maxDate === null || lastUpdatedDate > maxDate) {
            maxDate = lastUpdatedDate
        }
    }

    return [pricedTokens, maxDate]
}

async function fetchTokenPrices(): Promise<StringKeyMap> {
    const batches = toChunks(cmcIds, BATCH_SIZE)
    const batchResults = await Promise.all(batches.map(fetchBatchWithRetries))
    let pricesMap = {}
    for (const batchResult of batchResults) {
        pricesMap = { ...pricesMap, ...batchResult }
    }
    return pricesMap
}

async function fetchBatchWithRetries(ids: number[]): Promise<StringKeyMap> {
    let batchPrices = null
    let numAttempts = 0
    try {
        while (batchPrices === null && numAttempts < 10) {
            batchPrices = await fetchBatch(ids)
            if (batchPrices === null) {
                await sleep((1.5 ** numAttempts) * 200)
            }
            numAttempts += 1
        }
    } catch (err) {
        logger.error(`Error fetching token prices for batch -- ${err} -- (${ids.join(', ')})`)
        return {}
    }

    if (batchPrices === null) {
        logger.error(`Error fetching token prices for batch -- out of attempts -- (${ids.join(', ')})`)
        return {}
    } 

    return batchPrices
}

async function fetchBatch(ids: number[]): Promise<StringKeyMap[] | null> {
    let resp, error
    try {
        resp = await fetch(buildUrl(ids), {
            headers: { 
                'Accept': 'application/json',
                'X-CMC_PRO_API_KEY': config.CMC_API_KEY,
            },
        })
    } catch (err) {
        error = err
    }

    if (!resp || error) {
        logger.error(`Error fetching token prices: ${error}. Will retry`)
        return null
    }

    let data: { [key: string]: any } = {}
    try {
        data = await resp.json()
    } catch (err) {
        logger.error(
            `Error parsing json response while fetching token prices: ${err}`
        )
        return null
    }

    if (resp.status !== 200) {
        logger.error(`Fetching token prices failed with status ${resp.status}`, data)
        return null
    }

    if (!data?.data) {
        return null
    }

    return data.data || {}
}

export default pollTokenPrices