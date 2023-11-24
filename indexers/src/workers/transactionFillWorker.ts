import config from '../config'
import {
    logger,
    StringKeyMap,
    EvmBlock,
    SharedTables,
    toChunks,
    schemaForChainId,
    NewReportedHead,
    EvmLog,
    EvmTransaction,
    fullEvmBlockUpsertConfig,
    fullEvmLogUpsertConfig,
    fullEvmTransactionUpsertConfig,
    uniqueByKeys,
    snakeToCamel,
} from '../../../shared'
import { exit } from 'process'
import { createWsProviderPool } from '../wsProviderPool'
import { getIndexer } from '../indexers'
import { createWeb3Provider } from '../httpProviderPool'

class TransactionFillWorker {

    from: number

    to: number | null

    groupSize: number

    cursor: number

    saveBatchMultiple: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    constructor(from: number, to?: number | null, groupSize?: number, saveBatchMultiple?: number) {
        this.from = from
        this.to = to
        this.cursor = to
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
        createWeb3Provider(true)
        createWsProviderPool(true)
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            logger.info(`${start} -> ${end}`)
            await this._fillRange(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        logger.info('DONE')
        exit()
    }

    async _fillRange(start: number, end: number) {
        const missingSomePrimitive = (await SharedTables.query(
            `SELECT s.id AS missing FROM generate_series(${start}, ${end}) s(id) WHERE NOT EXISTS (SELECT 1 FROM ${schemaForChainId[config.CHAIN_ID]}.transactions WHERE block_number = s.id LIMIT 1) OR NOT EXISTS (SELECT 1 FROM ${schemaForChainId[config.CHAIN_ID]}.logs WHERE block_number = s.id LIMIT 1)`
        )).map(r => parseInt(r.missing))
        if (!missingSomePrimitive.length) return
        await this._indexBlockGroup(missingSomePrimitive)
    }

    async _indexBlockGroup(blockNumbers: number[]) {
        const indexResultPromises = []
        for (const blockNumber of blockNumbers) {
            indexResultPromises.push(this._indexBlock(blockNumber))
        }

        logger.info(`Indexing ${blockNumbers[0]} --> ${blockNumbers[blockNumbers.length - 1]}...`)

        const indexResults = await Promise.all(indexResultPromises)
        this.batchResults.push(...indexResults)
        this.saveBatchIndex++

        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchResults = [...this.batchResults]
            try {
                await this._saveBatchResults(batchResults)
            } catch (err) {
                logger.error(`Error saving batch: ${err}`)
                return
            }
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
            force: true,
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
        let transactions = []
        let logs = []

        for (const result of results) {
            if (!result) continue
            transactions.push(
                ...result.transactions.map((t) => ({
                    ...t,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            logs.push(
                ...result.logs.map((l) => ({ 
                    ...l, 
                    blockTimestamp: () => result.pgBlockTimestamp 
                }))
            )
        }

        if (!this.upsertConstraints.transaction && transactions.length) {
            this.upsertConstraints.transaction = fullEvmTransactionUpsertConfig(transactions[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullEvmLogUpsertConfig(logs[0])
        }

        transactions = this.upsertConstraints.transaction
            ? uniqueByKeys(transactions, this.upsertConstraints.transaction[1])
            : transactions

        logs = this.upsertConstraints.log 
            ? uniqueByKeys(logs, this.upsertConstraints.log[1].map(snakeToCamel)) : logs

        await Promise.all([
            this._upsertTransactions(transactions),
            this._upsertLogs(logs),
        ])
    }

    async _upsertTransactions(transactions: StringKeyMap[]) {
        if (!transactions.length) return
        logger.info(`Saving ${transactions.length} transactions...`)
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(EvmTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[]): Promise<StringKeyMap[]> {
        if (!logs.length) return []
        logger.info(`Saving ${logs.length} logs...`)
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        await Promise.all(
            toChunks(logs, this.chunkSize).map((chunk) => {
                return SharedTables
                    .createQueryBuilder()
                    .insert()
                    .into(EvmLog)
                    .values(chunk)
                    .orUpdate(updateLogCols, conflictLogCols)
                    .returning('*')
                    .execute()
            })
        )
    }
}

export function getTransactionFillWorker(): TransactionFillWorker {
    return new TransactionFillWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
    )
}