import { chainIds, NewReportedHead } from '../../../shared'
import EvmIndexer from './EvmIndexer'
import PolygonIndexer from './PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
        case chainIds.OPTIMISM:
        case chainIds.ARBITRUM:
        case chainIds.PGN:
            return new EvmIndexer(head, { emitTransactions: true })
        case chainIds.POLYGON:
            return new PolygonIndexer(head, { emitTransactions: true })
        case chainIds.MUMBAI:
            return new PolygonIndexer(head)
        default:
            return new EvmIndexer(head)
    }
}
