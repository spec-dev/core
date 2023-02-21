import { logger, indexerRedis } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await indexerRedis.connect()
    logger.info('Starting event sorter...')
    getWorker().run()
}

run()