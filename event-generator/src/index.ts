import { logger, indexerRedis, CoreDB, IndexerDB, abiRedis, ChainTables } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        indexerRedis.connect(),
        abiRedis.connect(),
        CoreDB.initialize(),
        IndexerDB.initialize(),
        ChainTables.initialize(),
    ])
    logger.info('Starting event generator...')
    getWorker().run()
}

run()