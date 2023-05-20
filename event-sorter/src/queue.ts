import { Queue } from 'bullmq'
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
        attempts: config.EVENT_GENERATOR_JOB_MAX_ATTEMPTS,
        removeOnComplete: true,
        removeOnFail: 50,
        backoff: {
            type: 'fixed',
            delay: config.JOB_DELAY_ON_FAILURE,
        },
    },
})

let seen = new Set<number>()
const seenKeepCount = 500
const trimSeenSet = () => {
    if (seen.size <= seenKeepCount) return
    const trimmed = Array.from(seen).sort((a, b) => a - b).slice(seenKeepCount - 100)
    seen = new Set(trimmed)
}

export async function generateEventsForBlock(
    blockNumber: number, 
    options: SortedBlockEventsOptions = {},
) {
    blockNumber = Number(blockNumber)
    const color = options.replace ? 'yellow' : (seen.has(blockNumber) ? 'magenta' : 'cyanBright')
    logger.info(chalk[color](`Enqueueing sorted block ${blockNumber}`))
    seen.add(blockNumber)

    await queue.add(config.EVENT_GENERATOR_JOB_NAME, { ...options, blockNumber }, {
        priority: blockNumber,
    })

    trimSeenSet()
}