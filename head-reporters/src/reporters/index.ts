import { chainIds } from '../../../shared'
import { Reporter } from '../types'
import EthereumReporter from './EthereumReporter'
import PolygonReporter from './PolygonReporter'

export const getReporter = (chainId: number): Reporter | null => {
    switch (chainId) {
        // Ethereum Mainnet
        case chainIds.ETH_MAINNET:
            return new EthereumReporter(chainId)
        // Polygon Mainnet
        case chainIds.POLYGON_MAINNET:
            return new PolygonReporter(chainId)
        default:
            return null
    }
}
