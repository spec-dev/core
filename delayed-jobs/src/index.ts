import { logger, indexerRedis, SharedTables, CoreDB, abiRedis } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        CoreDB.initialize(),
        SharedTables.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
    ])
    logger.info('Starting delayed jobs worker...')
    getWorker().run()
}

run()