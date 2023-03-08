import { redis } from '../lib/indexer/redis'
import { exit } from 'process'

async function perform() {
    await redis.connect()
    await redis.del('block-events-series-1')
    await redis.del('block-events-series-80001')
    await redis.del('block-events-eager-blocks-1')
    await redis.del('block-events-eager-blocks-80001')
    await redis.del('block-events-skipped-blocks-1')
    await redis.del('block-events-skipped-blocks-80001')
    exit(0)
}

export default perform
