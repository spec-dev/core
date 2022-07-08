
import { NewReportedHead, logger } from 'shared'

class AbstractIndexer {
    head: NewReportedHead

    constructor(head: NewReportedHead) {
        this.head = head
    }

    async perform() {
        logger.info(`Chain ${this.head.chainId} - Indexing block ${this.head.blockNumber}...`)
    }
}

export default AbstractIndexer