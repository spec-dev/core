import { Queue } from 'bullmq'
import config from './config'
import { IndexedBlock, logger, NewReportedHead } from 'shared'

// Queue for reporting new block heads to our indexers.
const queue = new Queue(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

export async function reportBlock(block: IndexedBlock, replace: boolean) {
    const { chainId, blockNumber } = block
    const data: NewReportedHead = {
        chainId,
        blockNumber,
        replace,
    }

    logger.info(`Reporting block ${blockNumber} for indexing...`)
    await queue.add(config.INDEX_BLOCK_JOB_NAME, data)
}