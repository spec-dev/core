import { logger } from '../../shared'
import AbiTracker from './abiTracker'

async function run() {
    // await abiRedis.connect()
    logger.info('Starting ABI tracker...')
    const abiTracker = new AbiTracker()
    abiTracker.run()
}

run()