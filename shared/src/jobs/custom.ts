import { redis } from '../lib/indexer/redis'
import { exit } from 'process'

async function perform() {
    await redis.connect()
    await redis.del('polygon-head-reporter')
    exit(0)
}

export default perform
