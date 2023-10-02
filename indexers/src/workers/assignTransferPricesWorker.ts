import config from '../config'
import {
    logger,
    range,
    SharedTables,
    In,
    StringKeyMap,   
    unique,
    TokenTransfer,
    blockTimestampToTokenPriceTimestamp,
    TokenPrice,
    chainIds,
    ethereumToPolygonTokenMappings,
    formatPgDateString,
    polygonToEthereumTokenMappings,
    camelizeKeys,
} from '../../../shared'
import { calculateTokenPrice } from '../services/initTokenTransfers'
import { exit } from 'process'
import { Pool } from 'pg'
import short from 'short-uuid'
import pricedTokensRegistry from '../utils/pricedTokensRegistry'

const pricedTokenKeys = new Set<string>()
for (const data of Object.values(pricedTokensRegistry)) {
    pricedTokenKeys.add([data.chainId, data.tokenAddress].join(':'))
}

const tokenTransfersRepo = () => SharedTables.getRepository(TokenTransfer)
const tokenPricesRepo = () => SharedTables.getRepository(TokenPrice)

export class AssignTransferPricesWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    transfersToSave: TokenTransfer[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.transfersToSave = []

        // Create connection pool.
        this.pool = new Pool({
            host: config.SHARED_TABLES_DB_HOST,
            port: config.SHARED_TABLES_DB_PORT,
            user: config.SHARED_TABLES_DB_USERNAME,
            password: config.SHARED_TABLES_DB_PASSWORD,
            database: config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const group = range(start, end)
            await this._indexGroup(group)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.transfersToSave.length) {
            await this._updateTransfers(this.transfersToSave)
            this.transfersToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get ERC-20 transfers for this block range that don't already have prices assigned.
        const transfers = await this._getTransfersForBlocks(numbers)
        if (!transfers.length) return

        // Group transfers by token and find their unique block timestamps.
        const transfersByToken = {}
        const tokenTimestampsSeen = new Set()
        for (const transfer of transfers) {
            const { chainId, tokenAddress, blockTimestamp } = transfer
            const tokenKey = [chainId, tokenAddress].join(':')

            transfersByToken[tokenKey] = transfersByToken[tokenKey] || {
                chainId,
                tokenAddress,
                uniqueBlockTimestamps: [],
            }

            const tsKey = [tokenKey, blockTimestamp.toISOString()].join(':')
            if (tokenTimestampsSeen.has(tsKey)) continue

            transfersByToken[tokenKey].uniqueBlockTimestamps.push(blockTimestamp)
            tokenTimestampsSeen.add(tsKey)
        }

        // Build query utilizing block timestamp --> token price timestamp conversion.
        const clauses = []
        for (const key in transfersByToken) {
            const { chainId, tokenAddress, uniqueBlockTimestamps } = transfersByToken[key]
            const tokenPriceTimestamps = unique(uniqueBlockTimestamps.map(blockTimestamp => (
                blockTimestampToTokenPriceTimestamp(blockTimestamp)
            )))

            let otherChainAddress, otherChainId
            if (chainId === chainIds.ETHEREUM) {
                otherChainAddress = ethereumToPolygonTokenMappings[tokenAddress]
                otherChainId = chainIds.POLYGON
            } else if (chainId === chainIds.POLYGON) {
                otherChainAddress = polygonToEthereumTokenMappings[tokenAddress]
                otherChainId = chainIds.ETHEREUM
            }

            clauses.push({ tokenAddress, chainId, timestamp: In(tokenPriceTimestamps) })

            if (otherChainAddress && otherChainId) {
                clauses.push({ 
                    tokenAddress: otherChainAddress,
                    chainId: otherChainId,
                    timestamp: In(tokenPriceTimestamps),
                })
            }
        }

        const tokenPrices = await this._getTokenPrices(clauses)
        if (!tokenPrices.length) {
            logger.info(`No token prices found this batch.`)
            return
        }
        
        const tokenPricesMap = {}
        for (const tokenPrice of tokenPrices) {
            const { chainId, tokenAddress, timestamp } = tokenPrice
            const key = [chainId, tokenAddress, formatPgDateString(timestamp)].join(':')
            tokenPricesMap[key] = tokenPrice
        }

        const transfersToSave = []
        for (const transfer of transfers) {
            const { chainId, tokenAddress, blockTimestamp } = transfer
            const tokenPriceTimestamp = blockTimestampToTokenPriceTimestamp(blockTimestamp)
            const priceKey = [chainId, tokenAddress, tokenPriceTimestamp].join(':')
            let tokenPrice = tokenPricesMap[priceKey]
            
            let otherChainAddress, otherChainId
            if (!tokenPrice) {
                if (chainId === chainIds.ETHEREUM) {
                    otherChainAddress = ethereumToPolygonTokenMappings[tokenAddress]
                    otherChainId = chainIds.POLYGON
                } else if (chainId === chainIds.POLYGON) {
                    otherChainAddress = polygonToEthereumTokenMappings[tokenAddress]
                    otherChainId = chainIds.ETHEREUM
                }
                if (otherChainAddress && otherChainId) {
                    const otherChainPriceKey = [otherChainId, otherChainAddress, tokenPriceTimestamp].join(':')
                    tokenPrice = tokenPricesMap[otherChainPriceKey]    
                }
            }

            if (!tokenPrice) {
                let pricedTokenKey = [chainId, tokenAddress].join(':')
                if (otherChainAddress && otherChainId) {
                    pricedTokenKey = [otherChainId, otherChainAddress].join(':')
                }

                // Is this a token we have price data for?
                if (pricedTokenKeys.has(pricedTokenKey)) {
                    tokenPrice = await this._getMostRecentTokenPriceUnder(
                        chainId,
                        tokenAddress,
                        blockTimestamp,
                    )
                }
            }
            if (!tokenPrice) continue

            const value = transfer.value
            const decimals = Number(transfer.tokenDecimals || 18)
            const priceUsd = tokenPrice.priceUsd ? Number(tokenPrice.priceUsd) : tokenPrice.priceUsd
            const priceEth = tokenPrice.priceEth ? Number(tokenPrice.priceEth) : tokenPrice.priceEth
            const priceMatic = tokenPrice.priceMatic ? Number(tokenPrice.priceMatic) : tokenPrice.priceMatic

            transfer.valueUsd = calculateTokenPrice(value, decimals, priceUsd) as any
            transfer.valueEth = calculateTokenPrice(value, decimals, priceEth) as any
            transfer.valueMatic = calculateTokenPrice(value, decimals, priceMatic) as any

            transfersToSave.push(transfer)
        }
        if (!transfersToSave.length) return

        logger.info(`${transfersToSave.length} newly priced transfers.`)

        this.transfersToSave.push(...transfersToSave)

        if (this.transfersToSave.length >= 3000) {
            const toSave = [...this.transfersToSave]
            await this._updateTransfers(toSave)
            this.transfersToSave = []
        }
    }

    async _updateTransfers(transfers: TokenTransfer[]) {
        logger.info(`Saving ${transfers.length} priced transfers...`)
        const tempTableName = `tx_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const transfer of transfers) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
            insertBindings.push(...[transfer.id, transfer.valueUsd, transfer.valueEth, transfer.valueMatic])
            i += 4
        }
        const insertQuery = `INSERT INTO ${tempTableName} (id, value_usd, value_eth, value_matic) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id bigint not null primary key, value_usd numeric, value_eth numeric, value_matic numeric) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.token_transfers SET value_usd = ${tempTableName}.value_usd, value_eth = ${tempTableName}.value_eth, value_matic = ${tempTableName}.value_matic FROM ${tempTableName} WHERE tokens.token_transfers.id = ${tempTableName}.id`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error(e)
        } finally {
            client.release()
        }
    }

    async _getTokenPrices(clauses: StringKeyMap[]): Promise<TokenPrice[]> {
        try {
            return (await tokenPricesRepo().find({ where: clauses })) || []
        } catch (err) {
            logger.error(`Error getting token prices for clauses ${JSON.stringify(clauses, null, 4)}: ${err}`)
            return []
        }
    }
    
    async _getMostRecentTokenPriceUnder(
        chainId: string,
        tokenAddress: string,
        blockTimestamp: Date,
    ): Promise<TokenPrice | null> {
        const pgTimestamp = formatPgDateString(blockTimestamp)
        try {
            const results = (await SharedTables.query(
                `select * from tokens.token_prices where token_address = $1 and chain_id = $2 and timestamp < $3 order by timestamp desc limit 1`,
                [tokenAddress, chainId, pgTimestamp]
            )) || []
            const latest = results[0]
            return latest ? camelizeKeys(latest) as TokenPrice : null
        } catch (err) {
            logger.error(`Error getting most recent price for ${tokenAddress} under ${pgTimestamp}`)
            return null
        }
    }

    async _getTransfersForBlocks(numbers: number[]): Promise<TokenTransfer[]> {
        try {
            const transfers = await tokenTransfersRepo().find({
                where: {
                    blockNumber: In(numbers),
                    chainId: config.CHAIN_ID,
                }
            })
            return (transfers || []).filter(transfer => (
                transfer.valueUsd === null
            ))
        } catch (err) {
            logger.error(`Error getting transfers: ${err}`)
            return []
        }
    }
}

export function getAssignTransferPricesWorker(): AssignTransferPricesWorker {
    return new AssignTransferPricesWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}