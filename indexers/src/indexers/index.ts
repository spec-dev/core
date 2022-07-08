import { chainIds, NewReportedHead } from 'shared'
import EthereumIndexer from './ethereum-indexer'
import { Indexer } from '../types'

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        // Ethereum
        case chainIds.ETH_MAINNET:
            return new EthereumIndexer(head)

        default:
            return null
    }
}