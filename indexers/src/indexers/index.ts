import { chainIds, NewReportedHead } from '../../../shared'
import EvmIndexer from './EvmIndexer'
import PolygonIndexer from './PolygonIndexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        case chainIds.ETHEREUM:
            return new EvmIndexer(head, {
                indexTokenTransfers: true,
                indexTokenBalances: true,
            })

        case chainIds.POLYGON:
            return new PolygonIndexer(head)

        case chainIds.MUMBAI:
            return new PolygonIndexer(head, { indexTraces: false })

        case chainIds.GOERLI:
        case chainIds.BASE:
            return new EvmIndexer(head)

        default:
            return null
    }
}
