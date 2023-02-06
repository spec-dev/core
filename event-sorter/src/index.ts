import { logger, indexerRedis, getBlockEventsSeriesNumber } from '../../shared'
import { getWorker } from './worker'
import config from './config'

async function run() {
    await indexerRedis.connect()

    const seriesNumber = await getBlockEventsSeriesNumber(config.CHAIN_ID)
    if (seriesNumber === null) throw 'Block events series number missing'

    logger.info('Starting event sorter...')
    getWorker().run()
}

run()