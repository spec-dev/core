import { IndexerWorker } from '../types'
import config from '../config'
import { getHeadWorker } from './headWorker'
import { getRangeWorker } from './rangeWorker'
import { getLogWorker } from './logWorker'
import { getGapWorker } from './gapWorker'
import { getAbiWorker } from './abiWorker'
import { abiRedis } from '../../../shared'

export async function getWorker(): Promise<IndexerWorker> {
    if (!config.IS_RANGE_MODE) {
        return getHeadWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'log') {
        return getLogWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'gap') {
        return getGapWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'abi') {
        await abiRedis.connect()
        return getAbiWorker()
    }
    return getRangeWorker()
}