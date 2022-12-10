import { logger, chainIds, IndexerDB } from '../../shared'
import GapDetector from './gapDetector'
import config from './config'

const chainsToDetect = [
    chainIds.ETHEREUM,
    chainIds.POLYGON,
    chainIds.MUMBAI,
]

async function run() {
    await IndexerDB.initialize()
    const gapDetector = new GapDetector(chainsToDetect, config.GAP_TOLERANCE)
    logger.info('Starting gap detector...')
    gapDetector.run()
}

run()