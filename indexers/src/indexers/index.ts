import { chainIds, NewReportedHead } from '../../../shared'
import EvmIndexer from './EvmIndexer'
import PolygonIndexer from './PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        // Ethereum
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
            return new EvmIndexer(head, {
                indexTokenTransfers: true,
                indexTokenBalances: true,
            })

        // Polygon
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return new PolygonIndexer(head)

        default:
            return null
    }
}
