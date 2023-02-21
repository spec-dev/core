import { Queue, QueueScheduler } from 'bullmq'
import config from '../config'
import eth from './eth'
import ivy from './ivy'
import tokens from './tokens'
import { logger } from '../../../shared'

export const originEvents = {
    eth,
    ivy,
    tokens,
}

// Queue for reporting block events to the event sorter.
const queueKey = ['beq', config.CHAIN_ID].join('-')
const queue = new Queue(queueKey, {
    connection: {
        host: 'idx.5lbcv9.ng.0001.usw1.cache.amazonaws.com',
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
        host: 'idx.5lbcv9.ng.0001.usw1.cache.amazonaws.com',
        port: config.INDEXER_REDIS_PORT,
    }
})

export async function reportBlockEvents(blockNumber: number) {
    blockNumber = Number(blockNumber)
    logger.info(`Reporting block events...`)

    await queue.add(config.SORT_BLOCK_EVENTS_JOB_NAME, { blockNumber }, {
        priority: blockNumber,
        removeOnComplete: true,
        removeOnFail: 10,
    })
}