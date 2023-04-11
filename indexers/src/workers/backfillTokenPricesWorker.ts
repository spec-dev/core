import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,   
    TokenPrice,
    sleep,
    formatPgDateString,
    toChunks,
    addHours,
    addMinutes,
} from '../../../shared'
import { exit } from 'process'
import cmcIds from '../utils/cmcIds'
import pricedTokensRegistry from '../utils/pricedTokensRegistry'

const ETHEREUM_CMC_ID = 1027
const POLYGON_CMC_ID = 3890
const BATCH_SIZE = 700

const buildUrl = (ids: number[], start: string, end: string): string => {
    const url = new URL('https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/historical')
    url.searchParams.append('id', ids.join(','))
    url.searchParams.append('time_start', start)
    url.searchParams.append('time_end', end)
    return url.href
}

export class BackfillTokenPricesWorker {

    cursor: Date
    
    ceiling: Date

    constructor() {
        this.cursor = new Date('2023-03-03T09:25:00.000Z')
        this.ceiling = new Date('2023-03-03T10:25:00.000Z')
    }

    async run() {
        while (this.cursor && this.cursor < this.ceiling) {
            this.cursor = await this._fetchNextBatch(this.cursor)
        }
        logger.info('DONE')
        exit()
    }

    async _fetchNextBatch(startDate: Date): Promise<Date> {
        logger.info(`From ${startDate.toISOString()}`)

        const pgTimestamp = formatPgDateString(addMinutes(startDate, 5))
        if (await this._doTokenPricesExistAtTimestamp(pgTimestamp)) {
            logger.info(`Prices already exist starting at timestamp ${pgTimestamp}`)
            return null
        }

        const startTs = startDate.toISOString()
        const endDate = addHours(startDate, 1)
        const endTs = endDate.toISOString()
        const nextDate = addMinutes(endDate, 5)

        const batch = await fetchTokenPrices(startTs, endTs)
        const tokenPrices = this._groupAndPriceTokens(batch, startDate, nextDate)

        console.log(`Saving ${tokenPrices.length}...`)
        const chunks = toChunks(tokenPrices, 8000)
        for (const chunk of chunks) {
            await this._saveTokenPrices(chunk)
        }

        return addMinutes(endDate, 5)
    }

    _groupAndPriceTokens(data: StringKeyMap, startDate: Date, endDate: Date): StringKeyMap[] {
        const timestampGroups = {}
        for (const id in data) {
            if (!pricedTokensRegistry.hasOwnProperty(id)) continue
            const quotes = data[id].quotes || []

            for (const quote of quotes) {
                const timestamp = quote.timestamp
                const timestampDate = new Date(timestamp)

                if (timestampDate < startDate || timestampDate > endDate || timestampDate > this.ceiling) {
                    continue
                }

                const priceUsd = quote.quote?.USD?.price
                if (!timestamp || (priceUsd === null || priceUsd === undefined)) {
                    logger.error(`Missing USD price data for ${id}`, quote)
                    continue
                }

                timestampGroups[timestamp] = timestampGroups[timestamp] || {}
                timestampGroups[timestamp][id] = { id, priceUsd, timestamp }
            }
        }

        const allPricedTokens = []
        for (const timestamp in timestampGroups) {
            const quotes = timestampGroups[timestamp] || {}

            // Get ETH/USD.
            const ethToUsd = quotes[ETHEREUM_CMC_ID.toString()]?.priceUsd
            if (!ethToUsd) {
                logger.error(`Failed to pull latest ETH/USD price at ${timestamp}`)
                continue
            }

            // Get MATIC/USD.
            const maticToUsd = quotes[POLYGON_CMC_ID.toString()]?.priceUsd
            if (!maticToUsd) {
                logger.error(`Failed to pull latest MATIC/USD price at ${timestamp}.`)
                continue
            }

            // Format all tokens and assign 'priceUsd', 'priceEth', 'priceMatic'.
            const pricedTokens = buildPricedTokens(Object.values(quotes), ethToUsd, maticToUsd)
            allPricedTokens.push(...pricedTokens)
        }

        return allPricedTokens
    }

    async _saveTokenPrices(tokenPrices: StringKeyMap[]) {
        try {
            await SharedTables.manager.transaction(async (tx) => {
                await Promise.all(
                    toChunks(tokenPrices, 2000).map((chunk) => {
                        return tx
                            .createQueryBuilder()
                            .insert()
                            .into(TokenPrice)
                            .values(chunk)
                            .execute()
                    })
                )
            })
        } catch (err) {
            logger.error(`Error saving token prices: ${JSON.stringify(err)}`)
        }
    }
    
    async _doTokenPricesExistAtTimestamp(timestamp: string): Promise<boolean> {
        try {
            const results = (await SharedTables.query(
                `select exists(select 1 from tokens.token_prices where timestamp = $1 limit 1)`,
                [timestamp]
            )) || []
            return results[0].exists === true
        } catch (err) {
            logger.error(`Error checking existence of token prices at timestamp ${timestamp}: ${err}`)
            return true
        }
    }
}

async function fetchTokenPrices(start: string, end: string): Promise<StringKeyMap> {
    const batches = toChunks(cmcIds, BATCH_SIZE)
    const batchResults = await Promise.all(batches.map(ids => fetchBatchWithRetries(ids, start, end)))
    let pricesMap = {}
    for (const batchResult of batchResults) {
        pricesMap = { ...pricesMap, ...batchResult }
    }
    return pricesMap
}

async function fetchBatchWithRetries(ids: number[], start: string, end: string): Promise<StringKeyMap> {
    let batchPrices = null
    let numAttempts = 0
    try {
        while (batchPrices === null && numAttempts < 10) {
            batchPrices = await fetchBatch(ids, start, end)
            if (batchPrices === null) {
                await sleep((1.5 ** numAttempts) * 500)
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

async function fetchBatch(ids: number[], start: string, end: string): Promise<StringKeyMap[] | null> {
    let resp, error
    try {
        resp = await fetch(buildUrl(ids, start, end), {
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
        await sleep(3000)
        return null
    }

    let data: { [key: string]: any } = {}
    try {
        data = await resp.json()
    } catch (err) {
        logger.error(
            `Error parsing json response while fetching token prices`
        )
        await sleep(3000)
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

function buildPricedTokens(
    tokenPrices: StringKeyMap[],
    ethToUsd: number,
    maticToUsd: number,
): StringKeyMap[] {
    const pricedTokens = []

    for (const { id, priceUsd, timestamp } of tokenPrices) {
        const tokenData = pricedTokensRegistry[id]
        if (!tokenData) {
            logger.error(`No token data found in registry for id`, id)
            continue
        }

        const { chainId, tokenAddress, name, symbol } = tokenData 
        const priceEth = priceUsd / ethToUsd
        const priceMatic = priceUsd / maticToUsd

        pricedTokens.push({
            tokenName: name,
            tokenSymbol: symbol,
            tokenAddress,
            priceUsd,
            priceEth,
            priceMatic,
            timestamp: timestamp,
            chainId,
        })
    }

    return pricedTokens
}

export function getBackfillTokenPricesWorker(): BackfillTokenPricesWorker {
    return new BackfillTokenPricesWorker()
}