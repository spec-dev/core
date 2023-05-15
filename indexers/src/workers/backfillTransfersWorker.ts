import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    fullTokenTransferUpsertConfig,
    fullNftTransferUpsertConfig,
    snakeToCamel,
    NftTransfer,
    TokenTransfer,
    EthTraceStatus,
} from '../../../shared'
import { ident } from 'pg-format'
import { exit } from 'process'
import initTokenTransfers from '../services/initTokenTransfers'
import { 
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
} from '../utils/standardAbis'

class BackfillTransfersWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    tokenTransfers: TokenTransfer[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.tokenTransfers = []
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.tokenTransfers.length) {
            logger.info(`Saving ${this.tokenTransfers.length} token transfers...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertTokenTransfers(this.tokenTransfers, tx)
            })
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        // Get contracts for this block range.
        const tokenTransfers = await this._getTokenTransfersInRange(start, end)
        if (!tokenTransfers.length) return
        
        this.tokenTransfers.push(...tokenTransfers)

        if (this.tokenTransfers.length >= 3000) {
            logger.info(`Saving ${this.tokenTransfers.length} token transfers...`)
            const tokenTransfers = [...this.tokenTransfers]
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertTokenTransfers(tokenTransfers, tx)
            })
            this.tokenTransfers = []
        }
    }

    async _upsertTokenTransfers(tokenTransfers: TokenTransfer[], tx: any) {
        const [updateCols, conflictCols] = fullTokenTransferUpsertConfig()
        tokenTransfers = uniqueByKeys(tokenTransfers, conflictCols.map(snakeToCamel)) as TokenTransfer[]
        await Promise.all(
            toChunks(tokenTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(TokenTransfer)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }

    async _upsertNftTransfers(nftTransfers: NftTransfer[], tx: any) {
        const [updateCols, conflictCols] = fullNftTransferUpsertConfig(nftTransfers[0])
        nftTransfers = uniqueByKeys(nftTransfers, conflictCols.map(snakeToCamel)) as NftTransfer[]
        await Promise.all(
            toChunks(nftTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(NftTransfer)
                    .values(chunk)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            })
        )
    }

    async _getTokenTransfersInRange(start: number, end: number): Promise<TokenTransfer[]> {
        const [transferLogs, successfulTraces] = await Promise.all([
            this._getTransferLogsInBlockRange(start, end),
            this._getTracesInBlockRange(start, end),
        ])
        const successfulTransferLogs = await this._filterTransferLogsForSuccess(transferLogs || [])
        if (!successfulTransferLogs.length && !successfulTraces.length) return []
        const [tokenTransfers, _] = await initTokenTransfers([], [],
            successfulTransferLogs,
            successfulTraces,
            config.CHAIN_ID,
        )
        return tokenTransfers
    }

    async _getTransferLogsInBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('logs')].join('.')
        const numberClause = 'block_number >= $1 and block_number <= $2'

        try {
            const results = (await SharedTables.query(
                `select * from ${table} where ${numberClause} and event_name in ($3, $4, $5)`,
                [start, end, TRANSFER_EVENT_NAME, TRANSFER_SINGLE_EVENT_NAME, TRANSFER_BATCH_EVENT_NAME]
            )) || []
            return camelizeKeys(results) as StringKeyMap[]
        } catch (err) {
            logger.error(`Error getting transfer logs`, err)
            return []
        }
    }

    async _getTracesInBlockRange(start: number, end: number): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('traces')].join('.')
        const numberClause = 'block_number >= $1 and block_number <= $2'
        try {
            const results = ((await SharedTables.query(
                `select * from ${table} where ${numberClause}`,
                [start, end]
            )) || []).filter(t => t.status !== EthTraceStatus.Failure)
            return camelizeKeys(results) as StringKeyMap[]
        } catch (err) {
            logger.error(`Error getting traces:`, err)
            return []
        }
    }

    async _filterTransferLogsForSuccess(logs: StringKeyMap[]): Promise<StringKeyMap[]> {
        const schema = schemaForChainId[config.CHAIN_ID]
        const table = [ident(schema), ident('transactions')].join('.')

        const txHashesSet = new Set<string>()
        logs.forEach(log => { txHashesSet.add(log.transactionHash) })
        if (!txHashesSet.size) return []
        const txHashes = Array.from(txHashesSet)
        const placeholders = []
        let i = 1
        for (const _ of txHashes) {
            placeholders.push(`$${i}`)
            i++
        }
        let txResults = []
        try {
            txResults = await SharedTables.query(
                `select hash, status from ${table} where hash in (${placeholders.join(', ')})`,
                txHashes,
            )
        } catch (err) {
            logger.error(`Error getting transactions`, err)
            return []
        }
        const successfulTxHashes = new Set(
            txResults.filter((tx) => tx.status != 0).map((tx) => tx.hash)
        )
        return logs.filter(log => successfulTxHashes.has(log.transactionHash))
    }
}

export function getBackfillTransfersWorker(): BackfillTransfersWorker {
    return new BackfillTransfersWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}