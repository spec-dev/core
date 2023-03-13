import { logger, chainIds, IndexerDB, SharedTables } from '../../shared'
import GapDetector from './gapDetector'

async function run() {
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
    ])
    const gapDetector = new GapDetector(Object.values(chainIds))
    logger.info('Starting gap detector...')
    gapDetector.run()
}

run()