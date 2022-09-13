import { IndexerWorker } from '../types'
import config from '../config'
import { getHeadWorker } from './headWorker'
import { getRangeWorker } from './rangeWorker'
import { getLogWorker } from './logWorker'
import { getGapWorker } from './gapWorker'

export function getWorker(): IndexerWorker {
    if (!config.IS_RANGE_MODE) {
        return getHeadWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'log') {
        return getLogWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'gap') {
        return getGapWorker()
    }
    return getRangeWorker()
}
