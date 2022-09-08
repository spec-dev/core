import config from '../config'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import getBlockReceipts from '../indexers/ethereum/services/getBlockReceipts'
import initLogs from '../indexers/ethereum/services/initLogs'
import {
    logger,
    range,
    StringKeyMap,
    EthLog,
    EthTransaction,
    fullLogUpsertConfig,
    fullReceiptUpsertConfig,
    SharedTables,
    uniqueByKeys,
    hasBlockBeenIndexedForLogs,
    registerBlockLogsAsIndexed,
    hexToNumber,
    normalizeEthAddress,
    normalize32ByteHash,
    hexToNumberString,
    numberToHex,
    EthReceipt,
} from '../../../shared'

class LogWorker {
    web3: AlchemyWeb3

    from: number

    to: number | null

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    batchBlockNumbersIndexed: number[] = []

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    chainId: number = 1

    constructor(from: number, to?: number | null, groupSize?: number, saveBatchMultiple?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
        this.web3 = createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
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
            await this._saveBatches(this.batchBlockNumbersIndexed, this.batchResults) 
        }
        logger.info('DONE')
    }

    async _indexBlockGroup(blockNumbers: number[]) {
        const blockNumbersToIndex = await this._getBlockNumbersThatNeedLogsIndexed(blockNumbers)
        if (!blockNumbersToIndex.length) return

        logger.info(`Indexing logs for ${blockNumbersToIndex.join(', ')}...`)
        const results = await Promise.all(blockNumbersToIndex.map(n => this._indexLogsForBlockNumber(n)))

        const successfulResults = []
        const successfulBlockNumbersIndexed = []
        for (let i = 0; i < blockNumbersToIndex.length; i++) {
            const blockNumber = blockNumbersToIndex[i]
            const result = results[i]
            if (result === null) continue
            successfulResults.push(result)
            successfulBlockNumbersIndexed.push(blockNumber)
        }
        
        this.batchResults.push(...successfulResults)
        this.batchBlockNumbersIndexed.push(...successfulBlockNumbersIndexed)
        this.saveBatchIndex++

        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchResults = [...this.batchResults]
            const batchBlockNumbersIndexed = [...this.batchBlockNumbersIndexed]
            this._saveBatches(batchBlockNumbersIndexed, batchResults)
            this.batchResults = []
            this.batchBlockNumbersIndexed = []
        }
    }

    async _saveBatches(batchBlockNumbersIndexed: number[], batchResults: any[]) {
        const t0 = performance.now()
        try {
            await this._saveBatchResults(batchResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
            return
        }
        const t1 = performance.now()

        logger.info(`SAVED: ${(t1 - t0 / 1000).toFixed(2)}s`)

        await registerBlockLogsAsIndexed(batchBlockNumbersIndexed)
    }

    async _indexLogsForBlockNumber(blockNumber: number): Promise<StringKeyMap | null> {
        const hexBlockNumber = numberToHex(blockNumber)

        // Get receipts.
        let receipts
        try {
            receipts = await getBlockReceipts(
                this.web3,
                { blockNumber: hexBlockNumber },
                blockNumber,
                this.chainId,
            )
        } catch (err) {
            logger.error(`Error getting receipts for block ${blockNumber}:`, err)
            return null
        }
        if (!receipts?.length) return {}

        // Get block timestamp from one transaction in this block.
        const firstTxHash = receipts[0].transactionHash
        let transaction
        try {
            transaction = await SharedTables.getRepository(EthTransaction).findOneBy({
                hash: firstTxHash
            })    
        } catch (err) {
            logger.error(`Error fetching transaction for hash: ${firstTxHash}`)
            return null
        }
        if (!transaction) {
            logger.error(`Couldn't find a transaction for receipt transactionHash ${firstTxHash}`)
            return null
        }

        const block = { 
            number: blockNumber,
            hash: transaction.blockHash,
            timestamp: transaction.blockTimestamp
        }
        
        const logs = initLogs(block, receipts)
    
        const ethReceipts: EthReceipt[] = receipts.map(receipt => {
            const ethReceipt = new EthReceipt()
            ethReceipt.hash = receipt.transactionHash
            ethReceipt.contractAddress = normalizeEthAddress(receipt.contractAddress)
            ethReceipt.status = hexToNumber(receipt.status)
            ethReceipt.root = normalize32ByteHash(receipt.root)
            ethReceipt.gasUsed = hexToNumberString(receipt.gasUsed)
            ethReceipt.cumulativeGasUsed = hexToNumberString(receipt.cumulativeGasUsed)
            ethReceipt.effectiveGasPrice = hexToNumberString(receipt.effectiveGasPrice)
            return ethReceipt
        })
        
        return {
            logs,
            receipts: ethReceipts,
        }
    }

    async _getBlockNumbersThatNeedLogsIndexed(blockNumbers: number[]): Promise<number[]> {
        const alreadyIndexed = await Promise.all(blockNumbers.map(hasBlockBeenIndexedForLogs))
        const notIndexed = []
        for (let i = 0; i < alreadyIndexed.length; i++) {
            if (alreadyIndexed[i]) continue
            notIndexed.push(blockNumbers[i])
        }
        return notIndexed
    }

    async _saveBatchResults(results: any[]) {
        let receipts = []
        let logs = []
        for (const result of results) {
            if (!result || !Object.keys(result).length) continue
            receipts.push(...result.receipts)
            logs.push(...result.logs)
        }

        if (!this.upsertConstraints.receipt && receipts.length) {
            this.upsertConstraints.receipt = fullReceiptUpsertConfig(receipts[0])
        }
        if (!this.upsertConstraints.log && logs.length) {
            this.upsertConstraints.log = fullLogUpsertConfig(logs[0])
        }
        
        receipts = this.upsertConstraints.receipt
            ? uniqueByKeys(receipts, this.upsertConstraints.transaction[1])
            : receipts
        
        logs = this.upsertConstraints.log 
            ? uniqueByKeys(logs, this.upsertConstraints.log[1])
            : logs
                
        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertReceipts(receipts, tx),
                this._upsertLogs(logs, tx),
            ])
        })
    }

    async _upsertReceipts(receipts: StringKeyMap[], tx: any) {
        if (!receipts.length) return
        const [updateCols, conflictCols] = this.upsertConstraints.receipt
        await Promise.all(this._toChunks(receipts, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .insert()
                .into(EthReceipt)
                .values(chunk)
                .orUpdate(updateCols, conflictCols)
                .execute()
        }))
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any) {
        if (!logs.length) return
        const [updateCols, conflictCols] = this.upsertConstraints.log
        await Promise.all(this._toChunks(logs, this.chunkSize).map(chunk => {
            return tx.createQueryBuilder()
                .insert()
                .into(EthLog)
                .values(chunk)
                .orUpdate(updateCols, conflictCols)
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

export function getLogWorker(): LogWorker {
    return new LogWorker(
        config.FROM_BLOCK,
        config.TO_BLOCK,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE,
    )
}
