import logger from '../lib/logger'
import { exit } from 'process'
import { redis, unmarkNamespaceAsFailing } from '../lib/indexer/redis'

async function perform(chainId: string, name: string) {
    await redis.connect()
    await unmarkNamespaceAsFailing(chainId, name)
    logger.info(`Success.`)
    exit(0)
}

export default perform
