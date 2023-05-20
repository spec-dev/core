import { logger, indexerRedis, CoreDB, SharedTables } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        indexerRedis.connect(),
        CoreDB.initialize(),
        SharedTables.initialize(),
    ])
    logger.info('Starting event generator...')
    getWorker().run()
}

run()