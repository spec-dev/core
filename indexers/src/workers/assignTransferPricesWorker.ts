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

const non18PricedTokenAddresses = new Set([
    '0x3d658390460295fb963f54dc0899cfb1c30776df',
    '0x1e797ce986c3cff4472f7d38d5c4aba55dfefe40',
    '0x75858677e27c930fb622759feaffee2b754af07f',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0xd46ba6d942050d489dbd938a2c909a5d5039a161',
    '0xbdbc2a5b32f3a5141acd18c39883066e4dab9774',
    '0x998ffe1e43facffb941dc337dd0468d52ba5b48a',
    '0x08130635368aa28b217a4dfb68e1bf8dc525621c',
    '0x68749665ff8d2d112fa859aa293f07a622782f38',
    '0x2c537e5624e4af88a7ae4060c022609376c8d0eb',
    '0xaffcdd96531bcd66faed95fc61e443d08f79efef',
    '0x61fd1c62551850d0c04c76fce614cbced0094498',
    '0xeb4c2781e4eba804ce9a9803c67d0893436bb27d',
    '0xd996035db82cae33ba1f16fdf23b816e5e9faabb',
    '0x39795344cbcc76cc3fb94b9d1b15c23c2070c66d',
    '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784',
    '0xd8e3fb3b08eba982f2754988d70d57edc0055ae6',
    '0x07150e919b4de5fd6a63de1f9384828396f25fdc',
    '0x7a2bc711e19ba6aff6ce8246c546e8c4b4944dfd',
    '0x798d1be841a82a273720ce31c822c61a67a601c3',
    '0x3832d2f059e55934220881f831be501d180671a7',
    '0x70e8de73ce538da2beed35d14187f6959a8eca96',
    '0xe6cc10ef4de1ccfb821c99c04abfe1859d8eab8f',
    '0xc08512927d12348f6620a698105e1baac6ecd911',
    '0xc56c2b7e71b54d38aab6d52e94a04cbfa8f604fa',
    '0x1c5db575e2ff833e46a2e9864c22f4b22e0b37c2',
    '0xc581b735a1688071a1746c968e0798d642ede491',
    '0xb9f747162ab1e95d07361f9048bcdf6edda9eea7',
    '0xfb19075d77a0f111796fb259819830f4780f1429',
    '0x756bfb452cfe36a5bc82e4f5f4261a89a18c242b',
    '0xcfeaead4947f0705a14ec42ac3d44129e1ef3ed5',
    '0xebf2096e01455108badcbaf86ce30b6e5a72aa52',
    '0xa693b19d2931d498c5b318df961919bb4aee87a5',
    '0x0000000005c6b7c1fd10915a05f034f90d524d6e',
    '0x9767203e89dcd34851240b3919d4900d3e5069f1',
    '0x9b25889c493ae6df34ceef1ecb10d77c1ba73318',
    '0x450e7f6e3a2f247a51b98c39297a9a5bfbdb3170',
    '0x35609dc59e15d03c5c865507e1348fa5abb319a8',
    '0x7884f51dc1410387371ce61747cb6264e1daee0b',
    '0x4086e77c5e993fdb90a406285d00111a974f877a',
    '0xed03ed872159e199065401b6d0d487d78d9464aa',
    '0xb8919522331c59f5c16bdfaa6a121a6e03a91f62',
    '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c',
    '0x7707aada3ce7722ac63b91727daf1999849f6835',
    '0xc1f33e0cf7e40a67375007104b929e49a581bafe',
    '0x820802fa8a99901f52e39acd21177b0be6ee2974'
])

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

        if (this.transfersToSave.length >= 2000) {
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
                transfer.valueUsd === null || non18PricedTokenAddresses.has(transfer.tokenAddress)
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