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
} from '../../../shared'
import { exit } from 'process'

class RangeWorker {
    from: number

    to: number | null

    groupSize: number

    cursor: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
    }

    async run() {
        while (this.cursor < this.to) {
            const groupBlockNumbers = range(
                this.cursor,
                Math.min(this.cursor + this.groupSize - 1, this.to)
            )
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

        // Group index results by block number.
        const retriedBlockNumbersThatSucceeded = []
        const inserts = []
        for (let i = 0; i < blockNumbersIndexed.length; i++) {
            const blockNumber = blockNumbersIndexed[i]
            const [blockHash, succeeded] = indexResults[i]

            if (!succeeded) {
                logger.error(`Indexing Block Failed: ${blockNumber} (${blockHash})`)
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
                hash: blockHash,
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

    async _indexBlock(blockNumber: number): Promise<[string | null, boolean]> {
        try {
            const indexer = getIndexer(this._atNumber(blockNumber))
            await indexer.perform()
            return [indexer.resolvedBlockHash, true]
        } catch (err) {
            logger.error(`Error indexing block ${blockNumber}:`, err)
            return [null, false]
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
}

export function getRangeWorker(): RangeWorker {
    return new RangeWorker(config.FROM_BLOCK, config.TO_BLOCK, config.RANGE_GROUP_SIZE)
}
