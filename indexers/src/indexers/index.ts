import { chainIds, NewReportedHead } from '../../../shared'
import EthereumIndexer from './ethereum/EthereumIndexer'
import PolygonIndexer from './polygon/PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        // Ethereum
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
            return new EthereumIndexer(head)

        // Polygon
        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return new PolygonIndexer(head)

        default:
            return null
    }
}
