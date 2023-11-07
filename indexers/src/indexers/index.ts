import { chainIds, NewReportedHead } from '../../../shared'
import EvmIndexer from './EvmIndexer'
import PolygonIndexer from './PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        case chainIds.GOERLI:
        case chainIds.BASE:
        case chainIds.ETHEREUM:
            return new EvmIndexer(head)

        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return new PolygonIndexer(head)

        default:
            return null
    }
}
