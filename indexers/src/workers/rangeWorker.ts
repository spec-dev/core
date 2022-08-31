import config from '../config'
import { getIndexer } from '../indexers'
import {
    insertIndexedBlocks,
    setIndexedBlocksToSucceeded,
    logger,
    NewReportedHead,
    IndexedBlockStatus,
    IndexedBlock,
    getBlocksInNumberRange,
    range,
    StringKeyMap,
    EthBlock,
    EthTrace,
    EthContract,
    EthLog,
    EthTransaction,
    fullBlockUpsertConfig,
    fullContractUpsertConfig,
    fullLogUpsertConfig,
    fullTraceUpsertConfig,
    fullTransactionUpsertConfig,
    SharedTables,
} from '../../../shared'
import { exit } from 'process'

class RangeWorker {
    from: number

    to: number | null

    groupSize: number

    cursor: number

    upsertConstraints: StringKeyMap

    chunkSize: number = 2000

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.upsertConstraints = {}
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const groupBlockNumbers = range(start, end)
            logger.info(`Indexing ${start} --> ${end}...`)
            await this._indexBlockGroup(groupBlockNumbers)
            this.cursor = this.cursor + this.groupSize
        }
        exit(0)
    }

    async _indexBlockGroup(blockNumbers: number[]) {
        // Get the indexed blocks for these numbers from our registry (IndexerDB).
        const existingIndexedBlocks = await this._getIndexedBlocksInNumberRange(blockNumbers)
        if (existingIndexedBlocks === null) return // is only null on failure

        // Map existing blocks by number.
        const existingIndexedBlocksMap = {}
        for (const existingIndexedBlock of existingIndexedBlocks) {
            existingIndexedBlocksMap[Number(existingIndexedBlock.number)] = existingIndexedBlock
        }

        // Start indexing this block group.
        const blockNumbersIndexed = []
        const indexResultPromises = []
        for (const blockNumber of blockNumbers) {
            const existingIndexedBlock = existingIndexedBlocksMap[blockNumber]

            // Only index blocks that haven't been indexed before or have previously failed.
            const shouldIndexBlock = !existingIndexedBlock || existingIndexedBlock.failed
            if (!shouldIndexBlock) continue

            blockNumbersIndexed.push(blockNumber)
            indexResultPromises.push(this._indexBlock(blockNumber))
        }

        // Don't do anything if the entire block group has already *successfully* been indexed.
        if (!blockNumbersIndexed.length) return

        // Index block group in parallel.
        const indexResults = await Promise.all(indexResultPromises)

        // Save all primitives for entire batch.
        let saveSucceeded = true
        try {
            await this._saveBatchResults(indexResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
            saveSucceeded = false
            throw err
        }

        // Group index results by block number.
        const retriedBlockNumbersThatSucceeded = []
        const inserts = []
        for (let i = 0; i < blockNumbersIndexed.length; i++) {
            const blockNumber = blockNumbersIndexed[i]
            const indexResult = indexResults[i]
            const succeeded = saveSucceeded && !!indexResult

            if (!succeeded) {
                logger.error(`Indexing Block Failed: ${blockNumber}`)
            }

            // If the indexed block already existed, but now succeeded, just update the 'failed' status.
            const existingIndexedBlock = existingIndexedBlocksMap[blockNumber]
            if (existingIndexedBlock) {
                succeeded && retriedBlockNumbersThatSucceeded.push(existingIndexedBlock.id)
                continue
            }

            // Fresh new indexed block entries.
            inserts.push({
                chainId: config.CHAIN_ID,
                number: blockNumber,
                hash: indexResult?.block?.hash,
                status: IndexedBlockStatus.Complete,
                failed: !succeeded,
            })
        }

        let persistResultPromises = []
        // Persist updates.
        retriedBlockNumbersThatSucceeded.length &&
            persistResultPromises.push(
                setIndexedBlocksToSucceeded(retriedBlockNumbersThatSucceeded)
            )
        // Persist inserts.
        inserts.length && persistResultPromises.push(insertIndexedBlocks(inserts))
        try {
            await Promise.all(persistResultPromises)
        } catch (err) {
            logger.error(
                `Error persisting indexed block results to DB for block range: ${blockNumbersIndexed}`,
                err
            )
            return false
        }
        return true
    }

    async _indexBlock(blockNumber: number): Promise<StringKeyMap | null> {
        try {
            const result = await getIndexer(this._atNumber(blockNumber)).perform()
            return result as StringKeyMap
        } catch (err) {
            logger.error(`Error indexing block ${blockNumber}:`, err)
            return null
        }
    }

    async _getIndexedBlocksInNumberRange(blockNumbers: number[]): Promise<IndexedBlock[] | null> {
        try {
            return await getBlocksInNumberRange(config.CHAIN_ID, blockNumbers)
        } catch (err) {
            logger.error(
                `Error getting indexed_blocks from DB for block range: ${blockNumbers}`,
                err
            )
            return null
        }
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

    async _saveBatchResults(results: any[]) {
        const blocks = []
        const transactions = []
        const logs = []
        const traces = []
        const contracts = []

        for (const result of results) {
            if (!result) continue
            blocks.push({ ...result.block, timestamp: () => result.pgBlockTimestamp })
            transactions.push(...result.transactions.map(t => ({ ...t, blockTimestamp: () => result.pgBlockTimestamp })))
            logs.push(...result.logs.map(l => ({ ...l, blockTimestamp: () => result.pgBlockTimestamp })))
            traces.push(...result.traces.map(t => ({ ...t, blockTimestamp: () => result.pgBlockTimestamp })))
            contracts.push(...result.contracts.map(c => ({ ...c, blockTimestamp: () => result.pgBlockTimestamp })))
        }

        if (!this.upsertConstraints.block && blocks.length) {
            this.upsertConstraints.block = fullBlockUpsertConfig(blocks[0])
        }
        if (!this.upsertConstraints.transaction && transactions.length) {
            this.upsertConstraints.transaction = fullTransactionUpsertConfig(transactions[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullLogUpsertConfig(logs[0])
        }
        if (!this.upsertConstraints.trace && traces.length) {
            this.upsertConstraints.trace = fullTraceUpsertConfig(traces[0])
        }
        if (!this.upsertConstraints.contract && contracts.length) {
            this.upsertConstraints.contract = fullContractUpsertConfig(contracts[0])
        }

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertBlocks(blocks, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
                this._upsertTraces(traces, tx),
                this._upsertContracts(contracts, tx),
            ])
        })
    }

    async _upsertBlocks(blocks: StringKeyMap[], tx: any) {
        if (!blocks.length) return
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(this._toChunks(transactions, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .createQueryBuilder()
                .insert()
                .into(EthTransaction)
                .values(chunk)
                .orUpdate(updateTransactionCols, conflictTransactionCols)
                .execute()
        }))
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any) {
        if (!logs.length) return
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        await Promise.all(this._toChunks(logs, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .createQueryBuilder()
                .insert()
                .into(EthLog)
                .values(chunk)
                .orUpdate(updateLogCols, conflictLogCols)
                .execute()
        }))
    }

    async _upsertTraces(traces: StringKeyMap[], tx: any) {
        if (!traces.length) return
        const [updateTraceCols, conflictTraceCols] = this.upsertConstraints.trace
        await Promise.all(this._toChunks(traces, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .insert()
                .into(EthTrace)
                .values(chunk)
                .orUpdate(updateTraceCols, conflictTraceCols)
                .execute()
        }))
    }

    async _upsertContracts(contracts: StringKeyMap[], tx: any) {
        if (!contracts.length) return
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.contract
        await Promise.all(this._toChunks(contracts, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .insert()
                .into(EthContract)
                .values(chunk)
                .orUpdate(updateContractCols, conflictContractCols)
                .execute()
        }))
    }

    _toChunks(arr: any[], chunkSize: number): any[][] {
        const result = []
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            result.push(chunk)
        }
        return result
    }
}

export function getRangeWorker(): RangeWorker {
    return new RangeWorker(config.FROM_BLOCK, config.TO_BLOCK, config.RANGE_GROUP_SIZE)
}
