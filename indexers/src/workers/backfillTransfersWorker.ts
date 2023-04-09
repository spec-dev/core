import config from '../config'
import {
    logger,
    SharedTables,
    StringKeyMap,
    uniqueByKeys,
    camelizeKeys,
    schemaForChainId,
    toChunks,
    fullErc20TransferUpsertConfig,
    fullNftTransferUpsertConfig,
    snakeToCamel,
    NftTransfer,
    Erc20Transfer,
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

    erc20Transfers: Erc20Transfer[]

    nftTransfers: NftTransfer[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.erc20Transfers = []
        this.nftTransfers = []
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }

        if (this.erc20Transfers.length) {
            logger.info(`Saving ${this.erc20Transfers.length} ERC-20 transfers...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Transfers(this.erc20Transfers, tx)
            })
        }

        if (this.nftTransfers.length) {
            logger.info(`Saving ${this.nftTransfers.length} NFT transfers...`)
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertNftTransfers(this.nftTransfers, tx)
            })
        }

        logger.info('DONE')
        exit()
    }

    async _indexGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        // Get contracts for this block range.
        const [erc20Transfers, nftTransfers] = await this._getTokenTransfersInRange(start, end)
        if (!erc20Transfers.length && !nftTransfers.length) return
        
        this.erc20Transfers.push(...erc20Transfers)
        this.nftTransfers.push(...nftTransfers)

        if (this.erc20Transfers.length >= 2000) {
            logger.info(`Saving ${this.erc20Transfers.length} ERC-20 transfers...`)
            const erc20Transfers = [...this.erc20Transfers]
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertErc20Transfers(erc20Transfers, tx)
            })
            this.erc20Transfers = []
        }

        if (this.nftTransfers.length >= 2000) {
            logger.info(`Saving ${this.nftTransfers.length} NFT transfers...`)
            const nftTransfers = [...this.nftTransfers]
            await SharedTables.manager.transaction(async (tx) => {
                await this._upsertNftTransfers(nftTransfers, tx)
            })
            this.nftTransfers = []
        }
    }

    async _upsertErc20Transfers(erc20Transfers: Erc20Transfer[], tx: any) {
        const [updateCols, conflictCols] = fullErc20TransferUpsertConfig(erc20Transfers[0])
        erc20Transfers = uniqueByKeys(erc20Transfers, conflictCols.map(snakeToCamel)) as Erc20Transfer[]
        await Promise.all(
            toChunks(erc20Transfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(Erc20Transfer)
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

    async _getTokenTransfersInRange(start: number, end: number): Promise<[Erc20Transfer[], NftTransfer[]]> {
        const transferLogs = await this._getTransferLogsInBlockRange(start, end)
        if (!transferLogs.length) return [[], []]

        const successfulTransferLogs = await this._filterTransferLogsForSuccess(transferLogs)
        if (!successfulTransferLogs.length) return [[], []]

        const [erc20Transfers, nftTransfers, _] = await initTokenTransfers([], [],
            successfulTransferLogs,
            config.CHAIN_ID,
        )
        return [erc20Transfers, nftTransfers]
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