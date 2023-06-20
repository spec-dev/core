import { logger, indexerRedis, CoreDB, SharedTables, IndexerDB } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        indexerRedis.connect(),
        CoreDB.initialize(),
        SharedTables.initialize(),
        IndexerDB.initialize(),
    ])
    logger.info('Starting event generator...')
    getWorker().run()
}

run()