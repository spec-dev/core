import { IndexerWorker } from '../types'
import config from '../config'
import { getHeadWorker } from './headWorker'
import { getEthRangeWorker } from './ethRangeWorker'
import { getPolygonRangeWorker } from './polygonRangeWorker'
import { getPolygonSpecificNumbersWorker } from './polygonSpecificBlocksIndexer'
import { getLogWorker } from './logWorker'
import { getDecodeLogWorker } from './decodeLogWorker'
import { getGapWorker } from './gapWorker'
import { getAbiWorker } from './abiWorker'
import { getDecodeTxWorker } from './decodeTxWorker'
import { getAbiPolisher } from './abiPolisher'
import { chainIds } from '../../../shared'
import { getClassifyContractWorker } from './classifyContractWorker'
import { getTracesToInteractionsWorker } from './tracesIntoInteractionsWorker'

export async function getWorker(): Promise<IndexerWorker> {
    if (!config.IS_RANGE_MODE) {
        return getHeadWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'log') {
        return getLogWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'dlog') {
        return getDecodeLogWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'gap') {
        return getGapWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'abi') {
        return getAbiWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'abi-polisher') {
        return getAbiPolisher()
    }
    if (config.RANGE_WORKER_TYPE === 'dtx') {
        return getDecodeTxWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'cc') {
        return getClassifyContractWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'ti') {
        return getTracesToInteractionsWorker()
    }
    
    switch (config.CHAIN_ID) {
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return config.SPECIFIC_INDEX_NUMBERS.length
                ? getPolygonSpecificNumbersWorker() 
                : getPolygonRangeWorker()

        case chainIds.ETHEREUM:
            return getEthRangeWorker()
    }
}
