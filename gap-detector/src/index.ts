import { logger, chainIds, IndexerDB, SharedTables } from '../../shared'
import GapDetector from './gapDetector'

const chainsToDetect = [
    chainIds.ETHEREUM,
    chainIds.POLYGON,
    chainIds.MUMBAI,
]

async function run() {
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
    ])
    const gapDetector = new GapDetector(chainsToDetect)
    logger.info('Starting gap detector...')
    gapDetector.run()
}

run()