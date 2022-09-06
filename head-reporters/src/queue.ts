import { Queue, QueueScheduler } from 'bullmq'
import config from './config'
import { IndexedBlock, logger, NewReportedHead } from '../../shared'

// Queue for reporting new block heads to our indexers.
const queue = new Queue(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    },
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 300,
        },
    },
})

const queueScheduler = new QueueScheduler(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    },
})

export async function reportBlock(block: IndexedBlock, replace: boolean) {
    const { id, chainId, number, hash } = block
    const data: NewReportedHead = {
        id,
        chainId,
        blockNumber: number,
        blockHash: hash,
        replace,
    }

    logger.info(`Enqueueing block ${number} for indexing...`)
    await queue.add(config.INDEX_BLOCK_JOB_NAME, data)
}
