import { logger, indexerRedis, SharedTables, abiRedis } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        SharedTables.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
    ])
    logger.info('Starting delayed jobs worker...')
    getWorker().run()
}

run()