import { logger, indexerRedis } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await indexerRedis.connect()
    logger.info('Starting delayed jobs worker...')
    getWorker().run()
}

run()