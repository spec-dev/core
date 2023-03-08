import { exit } from 'process'
import { Queue } from 'bullmq'
import config from '../lib/config'

async function perform() {
    const queueEth = new Queue([config.BLOCK_EVENTS_QUEUE_PREFIX, '1'].join('-'), {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })
    await queueEth.obliterate()
    console.log('Success')
    const queueMumbai = new Queue([config.BLOCK_EVENTS_QUEUE_PREFIX, '80001'].join('-'), {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })
    await queueMumbai.obliterate()
    console.log('Success')
    exit(0)
}

export default perform
