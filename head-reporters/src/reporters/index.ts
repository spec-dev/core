import { chainIds } from '../../../shared'
import { Reporter } from '../types'
import EthereumReporter from './EthereumReporter'
import PolygonReporter from './PolygonReporter'

export const getReporter = (chainId: string): Reporter | null => {
    switch (chainId) {
        case chainIds.ETHEREUM:
        case chainIds.GOERLI:
            return new EthereumReporter(chainId)

        case chainIds.POLYGON:
        case chainIds.MUMBAI:
            return new PolygonReporter(chainId)

        default:
            return null
    }
}