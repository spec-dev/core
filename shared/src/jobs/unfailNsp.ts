import logger from '../lib/logger'
import { exit } from 'process'
import { indexerRedis, unmarkNamespaceAsFailing } from '..'

async function perform(chainId: string, name: string) {
    await indexerRedis.connect()
    await unmarkNamespaceAsFailing(chainId, name)
    logger.info(`Success.`)
    exit(0)
}

export default perform
