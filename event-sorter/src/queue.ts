import { Queue, QueueScheduler } from 'bullmq'
import config from './config'
import { logger, SortedBlockEventsOptions } from '../../shared'
import chalk from 'chalk'

// Queue for sending sorted block events to the event generator.
const queueKey = [config.EVENT_GENERATOR_QUEUE_PREFIX, config.CHAIN_ID].join('-')
const queue = new Queue(queueKey, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    },
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'fixed',
            delay: 2000,
        },
    },
})

const queueScheduler = new QueueScheduler(queueKey, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

export async function generateEventsForBlock(
    blockNumber: number, 
    options: SortedBlockEventsOptions = {},
) {
    blockNumber = Number(blockNumber)
    logger.info(chalk.cyanBright(`Enqueueing sorted block ${blockNumber}`))

    await queue.add(config.EVENT_GENERATOR_JOB_NAME, { ...options, blockNumber }, {
        priority: blockNumber,
        removeOnComplete: true,
        removeOnFail: 10,
    })
}