import config from './config'
import { logger, IndexerDB, indexerRedis } from 'shared'
import { getReporter } from './reporters'

async function listen() {
    await IndexerDB.initialize()
    await indexerRedis.connect()

    // Get proper reporter for chain id.
    const reporter = getReporter(config.CHAIN_ID)
    if (!reporter) {
        logger.error(`No reporter exists for chainId: ${config.CHAIN_ID}`)
        return
    }

    // Listen and report new heads.
    reporter.listen()
}

listen()