import { Queue, QueueScheduler } from 'bullmq'
import config from '../config'
import { StringKeyMap, DelayedJobSpec } from '../types'
import logger from '../logger'

let queue = null

const upsertQueue = () => {
    if (queue) return

    queue = new Queue(config.DELAYED_JOB_QUEUE_KEY, {
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

    const queueScheduler = new QueueScheduler(config.DELAYED_JOB_QUEUE_KEY, {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })
}

export async function enqueueDelayedJob(name: string, params: StringKeyMap): Promise<boolean> {
    upsertQueue()

    logger.info(`Enqueueing delayed job ${name}...`)
    const delayedJobSpec = { name, params } as DelayedJobSpec

    try {
        await queue.add(name, delayedJobSpec)
    } catch (err) {
        logger.error(`Failed to enqueue delayed job ${name}: ${err}`)
        return false
    }

    return true
}
