import { chainIds, NewReportedHead } from 'shared'
import EthereumIndexer from './ethereum/EthereumIndexer'
import { Indexer } from '../types'
import config from '../config'
import { AlchemyWeb3, createAlchemyWeb3 } from '@alch/alchemy-web3'

let web3: AlchemyWeb3
const getWeb3 = () => {
    web3 = web3 || createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
    return web3
}

export const getIndexer = (head: NewReportedHead): Indexer | null => {
    switch (head.chainId) {
        // Ethereum
        case chainIds.ETH_MAINNET:
            return new EthereumIndexer(head, getWeb3())

        default:
            return null
    }
}
