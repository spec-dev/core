import { exit } from 'process'
import { Queue } from 'bullmq'
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

    console.log('Draining...')

    await queue.obliterate()
    exit(0)
}

export default perform
