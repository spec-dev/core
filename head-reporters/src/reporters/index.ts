import { chainIds } from 'shared'
import { Reporter } from '../types'
import EthereumReporter from './EthereumReporter'

export const getReporter = (chainId: number): Reporter | null => {
    switch (chainId) {
        // Ethereum
        case chainIds.ETH_MAINNET:
            return new EthereumReporter(chainId)

        default:
            return null
    }
}