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
        attempts: 60,
        backoff: {
            type: 'fixed',
            delay: 2000,
        },
    },
})

const queueScheduler = new QueueScheduler(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

export async function reportBlock(block: IndexedBlock, replace: boolean) {
    const { id, chainId, number, hash } = block
    const data: NewReportedHead = {
        id,
        chainId: chainId.toString(),
        blockNumber: number,
        blockHash: hash,
        replace,
        force: config.FORCE_REINDEX,
    }

    logger.info(`Enqueueing block ${number} for indexing...`)

    await queue.add(config.INDEX_BLOCK_JOB_NAME, data, {
        removeOnComplete: true,
        removeOnFail: 10,
    })
}
