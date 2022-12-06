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
    fullLatestInteractionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    EthLatestInteraction,
    toChunks,
    sleep,
} from '../../../shared'
import { exit } from 'process'
import fs from 'fs'

const latestInteractionsRepo = () => SharedTables.getRepository(EthLatestInteraction)

const numbers = [
    15993648,
]

class EthRangeWorker {
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
        const chunks = toChunks(numbers, this.groupSize)
        for (const chunk of chunks) {
            await this._indexBlockGroup(chunk)
        }
        // while (this.cursor < this.to) {
        //     const start = this.cursor
        //     const end = Math.min(this.cursor + this.groupSize - 1, this.to)
        //     const groupBlockNumbers = range(start, end)
        //     await this._indexBlockGroup(groupBlockNumbers)
        //     this.cursor = this.cursor + this.groupSize
        // }
        if (this.batchResults.length) {
            await this._saveBatches(
                this.batchBlockNumbersIndexed,
                this.batchResults,
                this.batchExistingBlocksMap
            )
        }
        logger.info('DONE')
        exit()
    }

    async _indexBlockGroup(blockNumbers: number[]) {
        // Get the indexed blocks for these numbers from our registry (Indexer DB).
        // const existingIndexedBlocks = await this._getIndexedBlocksInNumberRange(blockNumbers)
        const existingIndexedBlocks = []
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

        logger.info(`Indexing ${blockNumbers[0]} --> ${blockNumbers[blockNumbers.length - 1]}...`)

        // Index block group in parallel.
        const indexResults = await Promise.all(indexResultPromises)

        this.batchBlockNumbersIndexed.push(...blockNumbersIndexed)
        this.batchResults.push(...indexResults)
        this.batchExistingBlocksMap = {
            ...this.batchExistingBlocksMap,
            ...existingIndexedBlocksMap,
        }
        this.saveBatchIndex++

        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchBlockNumbersIndexed = [...this.batchBlockNumbersIndexed]
            const batchResults = [...this.batchResults]
            const batchExistingBlocksMap = { ...this.batchExistingBlocksMap }
            await this._saveBatches(batchBlockNumbersIndexed, batchResults, batchExistingBlocksMap)
            this.batchBlockNumbersIndexed = []
            this.batchResults = []
            this.batchExistingBlocksMap = {}
        }
    }

    async _saveBatches(
        batchBlockNumbersIndexed: number[] = [],
        batchResults: any[],
        batchExistingBlocksMap: { [key: number]: IndexedBlock } = {}
    ) {
        // try {
        await this._saveBatchResults(batchResults)
        // } catch (err) {
        //     logger.error(`Error saving batch: ${err}`)
        //     return [null, false]
        // }

        // Group index results by block number.
        const retriedBlockNumbersThatSucceeded = []
        const inserts = []
        for (let i = 0; i < batchBlockNumbersIndexed.length; i++) {
            const blockNumber = batchBlockNumbersIndexed[i]
            const result = batchResults[i]
            const succeeded = !!result

            if (!succeeded) {
                logger.error(`Indexing Block Failed: ${blockNumber}`)
            }

            // If the indexed block already existed, but now succeeded, just update the 'failed' status.
            const existingIndexedBlock = batchExistingBlocksMap[blockNumber]
            if (existingIndexedBlock) {
                succeeded && retriedBlockNumbersThatSucceeded.push(existingIndexedBlock.id)
                continue
            }

            // Fresh new indexed block entries.
            inserts.push({
                chainId: config.CHAIN_ID,
                number: blockNumber,
                hash: result?.block?.hash,
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
                `Error persisting indexed block results to DB for block range: ${batchBlockNumbersIndexed}`,
                err
            )
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
        let blocks = []
        let transactions = []
        let logs = []
        let traces = []
        let contracts = []
        let latestInteractions = []

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
            traces.push(
                ...result.traces.map((t) => ({
                    ...t,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            contracts.push(
                ...result.contracts.map((c) => ({
                    ...c,
                    blockTimestamp: () => result.pgBlockTimestamp,
                }))
            )
            latestInteractions.push(
                ...result.latestInteractions.map((c) => ({
                    ...c,
                    timestamp: () => result.pgBlockTimestamp,
                }))
            )
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
        if (!this.upsertConstraints.latestInteraction && latestInteractions.length) {
            this.upsertConstraints.latestInteraction = fullLatestInteractionUpsertConfig(
                latestInteractions[0]
            )
        }

        blocks = this.upsertConstraints.block
            ? uniqueByKeys(blocks, this.upsertConstraints.block[1])
            : blocks

        transactions = this.upsertConstraints.transaction
            ? uniqueByKeys(transactions, this.upsertConstraints.transaction[1])
            : transactions

        logs = this.upsertConstraints.log ? uniqueByKeys(logs, ['logIndex', 'transactionHash']) : logs

        traces = this.upsertConstraints.trace
            ? uniqueByKeys(traces, this.upsertConstraints.trace[1])
            : traces

        contracts = this.upsertConstraints.contract
            ? uniqueByKeys(contracts, this.upsertConstraints.contract[1])
            : contracts

        latestInteractions = latestInteractions.sort((a, b) => b.blockNumber - a.blockNumber)
        latestInteractions = this.upsertConstraints.latestInteraction
            ? uniqueByKeys(latestInteractions, this.upsertConstraints.latestInteraction[1])
            : latestInteractions

        logger.info('> Blocks')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertBlocks(blocks, tx)
        })

        logger.info('> Transactions')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertTransactions(transactions, tx)
        })

        logger.info('> Logs')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertLogs(logs, tx)
        })

        logger.info('> Traces')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertTraces(traces, tx)
        })

        logger.info('> Contracts')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertContracts(contracts, tx)
        })
        
        logger.info('> LatestInteractions')
        await SharedTables.manager.transaction(async (tx) => {
            await this._upsertLatestInteractions(latestInteractions, tx)
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
        logger.info(`Saving ${transactions.length} transactions...`)
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any) {
        if (!logs.length) return
        logger.info(`Saving ${logs.length} logs...`)
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        await Promise.all(
            toChunks(logs, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthLog)
                    .values(chunk)
                    .orUpdate(updateLogCols, conflictLogCols)
                    .execute()
            })
        )
    }

    async _upsertTraces(traces: StringKeyMap[], tx: any) {
        if (!traces.length) return
        logger.info(`Saving ${traces.length} traces...`)
        const [updateTraceCols, conflictTraceCols] = this.upsertConstraints.trace
        await Promise.all(
            toChunks(traces, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthTrace)
                    .values(chunk)
                    .orUpdate(updateTraceCols, conflictTraceCols)
                    .execute()
            })
        )
    }

    async _upsertContracts(contracts: StringKeyMap[], tx: any) {
        if (!contracts.length) return
        logger.info(`Saving ${contracts.length} contracts...`)
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.contract
        await Promise.all(
            toChunks(contracts, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }

    async _upsertLatestInteractions(latestInteractions: StringKeyMap[], tx: any, attempt: number = 1) {
        if (!latestInteractions.length) return
        const chunks = toChunks(latestInteractions, this.chunkSize)
        const [updateCols, conflictCols] = this.upsertConstraints.latestInteraction

        for (const chunk of chunks) {
            const existingLatestInteractions = (await latestInteractionsRepo().find({
                select: { from: true, to: true, blockNumber: true },
                where: chunk.map(li => ({ from: li.from, to: li.to }))
            })) || []
            const latestBlockNumberForGroup = {}
            for (const li of existingLatestInteractions) {
                latestBlockNumberForGroup[[li.from, li.to].join(':')] = li.blockNumber
            }
            const latestInteractionsToUpsert = []
            for (const li of chunk) {
                const lastBlockNumber = existingLatestInteractions[[li.from, li.to].join(':')]
                if (!lastBlockNumber || Number(li.blockNumber) > Number(lastBlockNumber)) {
                    latestInteractionsToUpsert.push(li)
                }
            }
            if (!latestInteractionsToUpsert.length) continue
            logger.info(`Saving ${latestInteractionsToUpsert.length} latest interactions...`)

            try {
                await tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthLatestInteraction)
                    .values(latestInteractionsToUpsert)
                    .orUpdate(updateCols, conflictCols)
                    .execute()
            } catch (err) {
                const message = err?.message || err?.toString() || ''
    
                // Wait and try again if deadlocked.
                if (attempt < 3 && message.toLowerCase().includes('deadlock')) {
                    logger.error(`[Attempt ${attempt}] Got deadlock, trying again...`)
                    await sleep(Math.floor(Math.random() * (600 - 400) + 400))
                    await this._upsertLatestInteractions(latestInteractions, tx, attempt + 1)
                }
            }
    
        }
        // const [updateCols, conflictCols] = this.upsertConstraints.latestInteraction
        // await Promise.all(
                // return tx
                //     .createQueryBuilder()
                //     .insert()
                //     .into(EthLatestInteraction)
                //     .values(chunk)
                //     .orUpdate(updateCols, conflictCols)
                //     .execute()
            // })
        // )
    }
}

export function getEthRangeWorker(): EthRangeWorker {
    return new EthRangeWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}
