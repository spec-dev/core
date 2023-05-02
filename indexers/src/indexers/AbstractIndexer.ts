import {
    NewReportedHead,
    logger,
    numberToHex,
    SharedTables,
    StringKeyMap,
    contractNamespaceForChainId,
    saveBlockEvents,
    saveBlockCalls,
    Erc20Token,
    fullErc20TokenUpsertConfig,
    NftCollection,
    fullNftCollectionUpsertConfig,
    fullTokenTransferUpsertConfig,
    fullNftTransferUpsertConfig,
    uniqueByKeys,
    TokenTransfer,
    NftTransfer,
    snakeToCamel,
    toChunks,
} from '../../../shared'
import config from '../config'
import short from 'short-uuid'
import { Pool } from 'pg'
import { reportBlockEvents } from '../events'
import chalk from 'chalk'

class AbstractIndexer {
    head: NewReportedHead

    resolvedBlockHash: string | null

    blockUnixTimestamp: number | null

    contractEventNsp: string

    pool: Pool

    erc20Tokens: Erc20Token[] = []

    tokenTransfers: TokenTransfer[] = []

    nftCollections: NftCollection[] = []

    nftTransfers: NftTransfer[] = []

    get chainId(): string {
        return this.head.chainId
    }

    get blockNumber(): number {
        return this.head.blockNumber
    }

    get hexBlockNumber(): string {
        return numberToHex(this.blockNumber)
    }

    get blockHash(): string | null {
        return this.head.blockHash || this.resolvedBlockHash
    }

    get logPrefix(): string {
        return `[${this.chainId}:${this.blockNumber}]`
    }

    get pgBlockTimestamp(): string {
        return `timezone('UTC', to_timestamp(${this.blockUnixTimestamp}))`
    }

    constructor(head: NewReportedHead) {
        this.head = head
        this.resolvedBlockHash = null
        this.blockUnixTimestamp = null
        this.contractEventNsp = contractNamespaceForChainId(this.chainId)
        this.pool = new Pool({
            host : config.SHARED_TABLES_DB_HOST,
            port : config.SHARED_TABLES_DB_PORT,
            user : config.SHARED_TABLES_DB_USERNAME,
            password : config.SHARED_TABLES_DB_PASSWORD,
            database : config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async perform(): Promise<StringKeyMap | void> {
        config.IS_RANGE_MODE ||
            logger.info(
                `\n${this.logPrefix} Indexing block ${this.blockNumber} (${this.blockHash})...`
            )

        if (this.head.replace) {
            this._info(chalk.magenta(`REORG: Replacing block ${this.blockNumber} (${this.blockHash})...`))
        }
    }

    async _kickBlockDownstream(eventSpecs: StringKeyMap[], callSpecs: StringKeyMap[]) {
        await Promise.all([
            saveBlockEvents(this.chainId, this.blockNumber, eventSpecs),
            saveBlockCalls(this.chainId, this.blockNumber, callSpecs),
        ])
        await reportBlockEvents(this.blockNumber)
    }

    async _blockAlreadyExists(schema: string): Promise<boolean> {
        try {
            const colName = this.blockHash ? 'hash' : 'number'
            const value = this.blockHash || this.blockNumber
            return (
                await SharedTables.query(
                    `SELECT EXISTS (SELECT 1 FROM ${schema}.blocks where ${colName} = $1)`,
                    [value]
                )
            )[0]?.exists
        } catch (err) {
            this._error(err)
            return false
        }
    }

    async _upsertErc20Tokens(erc20Tokens: Erc20Token[], tx: any) {
        if (!erc20Tokens.length) return
        const [updateCols, conflictCols] = fullErc20TokenUpsertConfig()
        const blockTimestamp = this.pgBlockTimestamp
        erc20Tokens = uniqueByKeys(erc20Tokens, conflictCols.map(snakeToCamel)) as Erc20Token[]
        this.erc20Tokens = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(Erc20Token)
                .values(erc20Tokens.map((c) => ({ ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps
    }

    async _upsertTokenTransfers(tokenTransfers: TokenTransfer[]) {
        if (!tokenTransfers.length) return
        const [updateCols, conflictCols] = fullTokenTransferUpsertConfig()
        const blockTimestamp = this.pgBlockTimestamp
        tokenTransfers = uniqueByKeys(tokenTransfers, conflictCols.map(snakeToCamel)) as TokenTransfer[]
        this.tokenTransfers = (
            await Promise.all(
                toChunks(tokenTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return SharedTables
                        .createQueryBuilder()
                        .insert()
                        .into(TokenTransfer)
                        .values(chunk.map((c) => ({ ...c, 
                            blockTimestamp: () => blockTimestamp,
                        })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps)
            .flat() as TokenTransfer[]
    }
    
    async _upsertNftCollections(nftCollections: NftCollection[], tx: any) {
        if (!nftCollections.length) return
        const [updateCols, conflictCols] = fullNftCollectionUpsertConfig()
        const blockTimestamp = this.pgBlockTimestamp
        nftCollections = uniqueByKeys(nftCollections, conflictCols.map(snakeToCamel)) as NftCollection[]
        this.nftCollections = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(NftCollection)
                .values(nftCollections.map((c) => ({ ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps
    }

    async _upsertNftTransfers(nftTransfers: NftTransfer[]) {
        if (!nftTransfers.length) return
        const [updateCols, conflictCols] = fullNftTransferUpsertConfig(nftTransfers[0])
        const blockTimestamp = this.pgBlockTimestamp
        nftTransfers = uniqueByKeys(nftTransfers, conflictCols.map(snakeToCamel)) as NftTransfer[]
        this.nftTransfers = (
            await Promise.all(
                toChunks(nftTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return SharedTables
                        .createQueryBuilder()
                        .insert()
                        .into(NftTransfer)
                        .values(chunk.map((c) => ({ ...c, 
                            blockTimestamp: () => blockTimestamp,
                        })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps)
            .flat() as NftTransfer[]
    }

    async _bulkUpdateErc20TokensTotalSupply(updates: StringKeyMap[], timestamp: string) {
        if (!updates.length) return
        const tempTableName = `erc20_tokens_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const { id, totalSupply } of updates) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
            insertBindings.push(...[id, totalSupply, timestamp])
            i += 3
        }
        
        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id integer primary key, total_supply character varying, last_updated timestamp with time zone) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(`INSERT INTO ${tempTableName} (id, total_supply, last_updated) VALUES ${insertPlaceholders.join(', ')}`, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_tokens SET total_supply = ${tempTableName}.total_supply, last_updated = ${tempTableName}.last_updated FROM ${tempTableName} WHERE tokens.erc20_tokens.id = ${tempTableName}.id`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            this._error(`Error bulk updating ERC-20 Tokens`, updates, e)
        } finally {
            client.release()
        }
    }

    async _wasUncled(): Promise<boolean> {
        return false // HACK - experiment
    }

    async _info(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.info(`${this.logPrefix} ${msg}`, ...args)
    }

    async _warn(msg: any, ...args: any[]) {
        logger.warn(`${this.logPrefix} ${msg}`, ...args)
    }

    async _error(msg: any, ...args: any[]) {
        logger.error(`${this.logPrefix} ${msg}`, ...args)
    }
}

export default AbstractIndexer
