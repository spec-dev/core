import { logger, chainIds, IndexerDB } from '../../shared'
import GapDetector from './gapDetector'

const chainsToDetect = [
    chainIds.ETHEREUM,
    chainIds.POLYGON,
    chainIds.MUMBAI,
]

async function run() {
    await IndexerDB.initialize()
    const gapDetector = new GapDetector(chainsToDetect)
    logger.info('Starting gap detector...')
    gapDetector.run()
}

run()