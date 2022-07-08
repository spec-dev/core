import { Network } from '@alch/alchemy-sdk'
import chainIds from './chainIds'

export function networkForChainId(chainId: number): Network | null {
    switch (chainId) {
        case chainIds.ETH_MAINNET:
            return Network.ETH_MAINNET
        default:
            return null
    }
}
