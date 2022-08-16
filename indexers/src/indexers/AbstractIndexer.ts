
import { NewReportedHead, logger, quickUncleCheck } from 'shared'

class AbstractIndexer {
    head: NewReportedHead

    constructor(head: NewReportedHead) {
        this.head = head
    }

    async perform() {
        const { blockNumber, blockHash, chainId } = this.head
        logger.info(`\n[${chainId}:${blockNumber}] Indexing block ${blockNumber} (${blockHash})...`)
        
        if (this.head.replace) {
            logger.info(`[${chainId}:${blockNumber}] GOT REORG -- Uncling existing block ${blockNumber}...`)
            await this._deleteRecordsWithBlockNumber()
        }
    }

    async _deleteRecordsWithBlockNumber() {
        throw 'must implement in child class'
    }

    async _wasUncled(): Promise<boolean> {
        return await quickUncleCheck(this.head.chainId, this.head.blockHash)
    }
}

export default AbstractIndexer