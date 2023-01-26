import config from '../config'
import { getIndexer } from '../indexers'
import {
    logger,
    NewReportedHead,
    IndexedBlock,
    StringKeyMap,
    PolygonBlock,
    PolygonLog,
    PolygonTransaction,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    toChunks,
} from '../../../shared'
import { exit } from 'process'
import { literal } from 'pg-format'

class PolygonRangeWorker {

    from: number

    to: number | null

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    batchBlockNumbersIndexed: number[] = []

    batchExistingBlocksMap: { [key: number]: IndexedBlock } = {}

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    constructor(from: number, to?: number | null, groupSize?: number, saveBatchMultiple?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexBlockGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.batchResults.length) {
            await this._saveBatches(this.batchResults)
        }
        logger.info('DONE')
        exit()
    }

    async _indexBlockGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)

        const missingBlockNumbers = (await SharedTables.query(
            `SELECT s.id AS missing FROM generate_series(${start}, ${end}) s(id) WHERE NOT EXISTS (SELECT 1 FROM polygon.blocks WHERE number = s.id)`
        )).map(r => r.missing)
        if (!missingBlockNumbers.length) return

        const indexResultPromises = []
        for (const blockNumber of missingBlockNumbers) {
            indexResultPromises.push(this._indexBlock(blockNumber))
        }
        const indexResults = await Promise.all(indexResultPromises)

        this.batchResults.push(...indexResults)
        this.saveBatchIndex++
        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchResults = [...this.batchResults]
            await this._saveBatches(batchResults)
            this.batchResults = []
        }
    }

    async _indexBlock(blockNumber: number): Promise<StringKeyMap | null> {
        let result
        try {
            result = await getIndexer(this._atNumber(blockNumber)).perform()
        } catch (err) {
            logger.error(`Error indexing block ${blockNumber}:`, err)
            return null
        }
        if (!result) return null

        return result as StringKeyMap
    }

    _atNumber(blockNumber: number): NewReportedHead {
        return {
            id: 0,
            chainId: config.CHAIN_ID,
            blockNumber,
            blockHash: null,
            replace: false,
        }
    }

    async _saveBatches(batchResults: any[]) {
        try {
            await this._saveBatchResults(batchResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
        }
    }

    async _saveBatchResults(results: any[]) {
        let blocks = []
        let transactions = []
        let logs = []

        for (const result of results) {
            if (!result) continue
            blocks.push({ ...result.block, timestamp: () => result.pgBlockTimestamp })
            transactions.push(
                ...result.transactions.map((t) => ({
                    ...t,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            logs.push(
                ...result.logs.map((l) => ({ ...l, blockTimestamp: () => result.pgBlockTimestamp }))
            )
        }

        if (!this.upsertConstraints.block && blocks.length) {
            this.upsertConstraints.block = fullPolygonBlockUpsertConfig(blocks[0])
        }
        if (!this.upsertConstraints.transaction && transactions.length) {
            this.upsertConstraints.transaction = fullPolygonTransactionUpsertConfig(transactions[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullPolygonLogUpsertConfig(logs[0])
        }

        blocks = this.upsertConstraints.block
            ? uniqueByKeys(blocks, this.upsertConstraints.block[1])
            : blocks

        transactions = this.upsertConstraints.transaction
            ? uniqueByKeys(transactions, this.upsertConstraints.transaction[1])
            : transactions

        logs = this.upsertConstraints.log ? uniqueByKeys(logs, ['logIndex', 'transactionHash']) : logs

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertBlocks(blocks, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
            ])
        })
    }

    async _upsertBlocks(blocks: StringKeyMap[], tx: any) {
        if (!blocks.length) return
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await tx
            .createQueryBuilder()
            .insert()
            .into(PolygonBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any): Promise<StringKeyMap[]> {
        if (!logs.length) return []
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        return (
            await Promise.all(
                toChunks(logs, this.chunkSize).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(PolygonLog)
                        .values(chunk)
                        .orUpdate(updateLogCols, conflictLogCols)
                        .returning('*')
                        .execute()
                })
            )
        ).map(result => result.generatedMaps).flat()
    }
}

export function getPolygonRangeWorker(): PolygonRangeWorker {
    return new PolygonRangeWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}