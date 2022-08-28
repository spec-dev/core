import { IndexerWorker } from '../types'
import config from '../config'
import { getHeadWorker } from './headWorker'
import { getRangeWorker } from './rangeWorker'

export function getWorker(): IndexerWorker {
    return config.IS_RANGE_MODE ? getRangeWorker() : getHeadWorker()
}
