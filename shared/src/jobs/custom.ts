import { exit } from 'process'
import { indexerRedis } from '..'
import { Queue } from 'bullmq'
import config from '../lib/config'

async function perform() {
    await indexerRedis.connect()

    const queue = new Queue('arb-hrq', {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })

    await queue.obliterate()

    exit(0)
}

export default perform
