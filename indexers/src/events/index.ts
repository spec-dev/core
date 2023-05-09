import { Queue } from 'bullmq'
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
const queueKey = [config.BLOCK_EVENTS_QUEUE_PREFIX, config.CHAIN_ID].join('-')
const queue = new Queue(queueKey, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    },
    defaultJobOptions: {
        attempts: 5,
        removeOnComplete: true,
        removeOnFail: 10,
        backoff: {
            type: 'fixed',
            delay: config.JOB_DELAY_ON_FAILURE,
        },
    },
})

export async function reportBlockEvents(blockNumber: number) {
    blockNumber = Number(blockNumber)
    logger.info(`[${config.CHAIN_ID}:${blockNumber}] Reporting block events...`)
    await queue.add(config.SORT_BLOCK_EVENTS_JOB_NAME, { blockNumber }, {
        priority: blockNumber,
    })
}