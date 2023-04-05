import { redis } from '../lib/core/redis'
import { exit } from 'process'
import { Queue, QueueScheduler } from 'bullmq'
import config from '../lib/config'

async function perform() {
    const queue = new Queue(config.DELAYED_JOB_QUEUE_KEY, {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
        defaultJobOptions: {
            attempts: 2,
            backoff: {
                type: 'fixed',
                delay: 1000,
            },
        },
    })

    await queue.drain()
    exit(0)
}

export default perform
