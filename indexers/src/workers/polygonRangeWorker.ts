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
    PolygonBlock,
    PolygonLog,
    PolygonTransaction,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    SharedTables,
    uniqueByKeys,
    formatAbiValueWithType,
    toChunks,
} from '../../../shared'
import { exit } from 'process'

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
            const groupBlockNumbers = range(start, end)
            await this._indexBlockGroup(groupBlockNumbers)
            this.cursor = this.cursor + this.groupSize
        }
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
        try {
            await this._saveBatchResults(batchResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
            return [null, false]
        }

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
            let x, y
            ;([x, y, logs] = await Promise.all([
                this._upsertBlocks(blocks, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
            ]))
        })
        
        const ivySmartWallets = logs.length ? this._getIvySmartWallets(logs) : []
        ivySmartWallets.length && await this._upsertIvySmartWallets(ivySmartWallets)
    }

    _getIvySmartWallets(logs: StringKeyMap[]): StringKeyMap[] {
        logs = logs.sort((a, b) => 
            (Number(b.blockNumber) - Number(a.blockNumber)) || 
            (b.transactionIndex - a.transactionIndex) || 
            (b.logIndex - a.logIndex)
        )
        const smartWallets = []
        for (const log of logs) {
            if (log.address === '0xfaf2b3ad1b211a2fe5434c75b50d256069d1b51f' && log.eventName === 'WalletCreated') {
                const eventArgs = log.eventArgs || []
                if (!eventArgs.length) continue
                const data = this._logEventArgsAsMap(eventArgs)
                const contractAddress = data.smartWallet
                const ownerAddress = data.owner
                if (!contractAddress || !ownerAddress) continue           
                
                smartWallets.push({
                    chainId: config.CHAIN_ID,
                    contractAddress,
                    ownerAddress,
                    transactionHash: log.transactionHash,
                    blockNumber: Number(log.blockNumber),
                    blockHash: log.blockHash,
                    blockTimestamp: log.blockTimestamp.toISOString(),
                })
            }
        }
        if (!smartWallets.length) return []

        return uniqueByKeys(smartWallets, ['chainId', 'contractAddress'])
    }

    _logEventArgsAsMap(eventArgs: StringKeyMap[]): StringKeyMap {
        const data = {}
        for (const arg of eventArgs) {
            if (arg.name) {
                data[arg.name] = formatAbiValueWithType(arg.value, arg.type)
            }
        }
        return data
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

    async _upsertIvySmartWallets(smartWallets: StringKeyMap[]) {
        for (const smartWallet of smartWallets) {
            try {
                await SharedTables.query(`INSERT INTO ivy.smart_wallets (chain_id, contract_address, owner_address, transaction_hash, block_number, block_hash, block_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (chain_id, contract_address) DO UPDATE SET owner_address = EXCLUDED.owner_address, transaction_hash = EXCLUDED.transaction_hash, block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, block_timestamp = EXCLUDED.block_timestamp`,
                    [
                        smartWallet.chainId,
                        smartWallet.contractAddress,
                        smartWallet.ownerAddress,
                        smartWallet.transactionHash,
                        smartWallet.blockNumber,
                        smartWallet.blockHash,
                        smartWallet.blockTimestamp,
                    ]
                )
            } catch (err) {
                logger.error('Failed to insert smart wallet', err)
                return
            }
            logger.info('\nADDED SMART WALLET!', smartWallet)
        }
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
