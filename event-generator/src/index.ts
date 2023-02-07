import { logger, indexerRedis, CoreDB } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await Promise.all([
        indexerRedis.connect(),
        CoreDB.initialize(),
    ])
    logger.info('Starting event generator...')
    getWorker().run()
}

run()