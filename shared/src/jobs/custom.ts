import { redis } from '../lib/indexer/redis'
import { exit } from 'process'
import { Queue } from 'bullmq'

async function perform() {
    await redis.connect()

    const queue = new Queue('head-reporter-queue')
    await queue.obliterate()

    exit(0)
}

export default perform
