import config from '../config'
import {
    logger,
    range,
    SharedTables,
    In,
    StringKeyMap,   
    unique,
    Erc20Transfer,
    blockTimestampToTokenPriceTimestamp,
    TokenPrice,
    chainIds,
    ethereumToPolygonTokenMappings,
    formatPgDateString,
    polygonToEthereumTokenMappings,
} from '../../../shared'
import { calculateTokenPrice } from '../services/initTokenTransfers'
import { exit } from 'process'
import { Pool } from 'pg'
import short from 'short-uuid'

const erc20TransfersRepo = () => SharedTables.getRepository(Erc20Transfer)
const tokenPricesRepo = () => SharedTables.getRepository(TokenPrice)

export class AssignTransferPricesWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    transfersToSave: Erc20Transfer[]

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
            const key = [chainId, tokenAddress].join(':')

            transfersByToken[key] = transfersByToken[key] || {
                chainId,
                tokenAddress,
                transfers: [],
                uniqueBlockTimestamps: [],
            }

            transfersByToken[key].transfers.push(transfer)

            const tsKey = [key, blockTimestamp.toISOString()].join(':')
            if (tokenTimestampsSeen.has(tsKey)) continue

            transfersByToken[key].uniqueBlockTimestamps.push(blockTimestamp)
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
        if (!tokenPrices.length) return

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

            if (!tokenPrice) {
                let otherChainAddress, otherChainId
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
                logger.warn(
                    `No token price (chainId=${chainId}, tokenAddress=${tokenAddress}, timestamp=${tokenPriceTimestamp})`
                )
                continue
            }

            const value = transfer.value
            const decimals = Number(transfer.tokenDecimals || 18)
            const { priceUsd, priceEth, priceMatic } = tokenPrice
    
            transfer.valueUsd = calculateTokenPrice(value, decimals, priceUsd) as any
            transfer.valueEth = calculateTokenPrice(value, decimals, priceEth) as any
            transfer.valueMatic = calculateTokenPrice(value, decimals, priceMatic) as any
            transfersToSave.push(transfer)
        }

        this.transfersToSave.push(...transfersToSave)

        if (this.transfersToSave.length >= 5000) {
            const toSave = [...this.transfersToSave]
            await this._updateTransfers(toSave)
            this.transfersToSave = []
        }
    }

    async _updateTransfers(transfers: Erc20Transfer[]) {
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
                `CREATE TEMP TABLE ${tempTableName} (id integer not null primary key, value_usd numeric, value_eth numeric, value_matic numeric) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_transfers SET value_usd = ${tempTableName}.value_usd, value_eth = ${tempTableName}.value_eth, value_matic = ${tempTableName}.value_matic FROM ${tempTableName} WHERE tokens.erc20_transfers.id = ${tempTableName}.id`
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

    async _getTransfersForBlocks(numbers: number[]): Promise<Erc20Transfer[]> {
        try {
            const transfers = await erc20TransfersRepo().find({
                where: {
                    blockNumber: In(numbers),
                    chainId: config.CHAIN_ID,
                }
            })
            return (transfers || []).filter(transfer => transfer.valueUsd === null)
        } catch (err) {
            logger.error(`Error getting transfers: ${err}`)
            return []
        }
    }
}

export function getAssignTransferPricesWorker(): AssignTransferPricesWorker {
    return new AssignTransferPricesWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}