
import { NewReportedHead, logger, setIndexedBlockStatus, IndexedBlockStatus } from 'shared'

class AbstractIndexer {
    head: NewReportedHead

    constructor(head: NewReportedHead) {
        this.head = head
    }

    async perform() {
        const { blockNumber, blockHash, chainId } = this.head
        logger.info(`Chain ${chainId} - Indexing block ${blockNumber} (${blockHash})...`)
        setIndexedBlockStatus(this.head.id, IndexedBlockStatus.Indexing)
    }
}

export default AbstractIndexer