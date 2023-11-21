import { chainIds, NewReportedHead } from '../../../shared'
import EvmIndexer from './EvmIndexer'
import PolygonIndexer from './PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
        case chainIds.SEPOLIA:
            return new EvmIndexer(head, { emitTransactions: true })
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return new PolygonIndexer(head, { emitTransactions: true })
        default:
            return new EvmIndexer(head)
    }
}
