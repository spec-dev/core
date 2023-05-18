import logger from '../lib/logger'
import { exit } from 'process'
import { redis } from '../lib/indexer/redis'

async function perform() {
    await redis.connect()
    await redis.del('tokens.NewWethBalances@0.0.1')
    await redis.del('tokens.NewErc20Balances@0.0.1')
    logger.info(`Success.`)
    exit(0)
}

export default perform
