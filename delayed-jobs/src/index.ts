import { logger, coreRedis } from '../../shared'
import { getWorker } from './worker'

async function run() {
    await coreRedis.connect()
    logger.info('Starting delayed jobs worker...')
    getWorker().run()
}

run()