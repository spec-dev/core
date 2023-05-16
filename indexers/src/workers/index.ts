import { IndexerWorker } from '../types'
import config from '../config'
import { getHeadWorker } from './headWorker'
import { getEthRangeWorker } from './ethRangeWorker'
import { getPolygonRangeWorker } from './polygonRangeWorker'
import { getPolygonSpecificNumbersWorker } from './polygonSpecificBlocksIndexer'
import { getPullBlocksWorker } from './pullBlocksWorker'
import { getPullTransactionsWorker } from './pullTransactionsWorker'
import { getPullLogsWorker } from './pullLogsWorker'
import { getPullTracesWorker } from './pullTracesWorker'
import { getPullContractsWorker } from './pullContractsWorker'
import { getDecodeLogWorker } from './decodeLogWorker'
import { getPolygonDecodeLogWorker } from './polygonDecodeLogWorker'
import { getGapWorker } from './gapWorker'
import { getAbiWorker } from './abiWorker'
import { getDecodeTxWorker } from './decodeTxWorker'
import { getAbiPolisher } from './abiPolisher'
import { chainIds } from '../../../shared'
import { getClassifyContractWorker } from './classifyContractWorker'
import { getTracesToInteractionsWorker } from './tracesIntoInteractionsWorker'
import { getSeedNftTablesWorker } from './seedNftTablesWorker'
import { getDecodeTraceWorker } from './decodeTraceWorker'
import { getSeedTokenContractsWorker } from './seedTokenContractsWorker'
import { getBackfillTransfersWorker } from './backfillTransfersWorker'
import { getAssignTransferPricesWorker } from './assignTransferPricesWorker'
import { getBackfillTokenPricesWorker } from './backfillTokenPricesWorker'
import { getValidateBlocksWorker } from './validateBlocksWorker'
import { getFindInvalidPrimitivesWorker } from './findInvalidPrimitivesWorker'
import { getSeedErc20BalancesWithOwnersWorker } from './seedErc20BalancesWithOwnersWorker'

export async function getWorker(): Promise<IndexerWorker> {
    if (!config.IS_RANGE_MODE) {
        return getHeadWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'pull-blocks') {
        return getPullBlocksWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'pull-transactions') {
        return getPullTransactionsWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'pull-logs') {
        return getPullLogsWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'pull-traces') {
        return getPullTracesWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'pull-contracts') {
        return getPullContractsWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'seed-nft-tables') {
        return getSeedNftTablesWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'seed-token-contracts') {
        return getSeedTokenContractsWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'backfill-transfers') {
        return getBackfillTransfersWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'assign-transfer-prices') {
        return getAssignTransferPricesWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'backfill-token-prices') {
        return getBackfillTokenPricesWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'dlog') {
        switch (config.CHAIN_ID) {
            case chainIds.POLYGON:
            case chainIds.MUMBAI:
                return getPolygonDecodeLogWorker()
            default:
                return getDecodeLogWorker()
        }
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
    if (config.RANGE_WORKER_TYPE === 'dtrace') {
        return getDecodeTraceWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'cc') {
        return getClassifyContractWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'ti') {
        return getTracesToInteractionsWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'vb') {
        return getValidateBlocksWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'fipw') {
        return getFindInvalidPrimitivesWorker()
    }
    if (config.RANGE_WORKER_TYPE === 'stb') {
        return getSeedErc20BalancesWithOwnersWorker()
    } 
    
    switch (config.CHAIN_ID) {
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return config.SPECIFIC_INDEX_NUMBERS.length
                ? getPolygonSpecificNumbersWorker() 
                : getPolygonRangeWorker()

        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
            return getEthRangeWorker()
    }
}
