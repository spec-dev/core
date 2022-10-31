const chainIds: { [key: string]: number } = {
    ETH_MAINNET: 1,
    POLYGON_MAINNET: 137,
}

export const productionChainNameForChainId = (chainId: number): string | null => {
    switch (chainId) {
        case chainIds.ETH_MAINNET:
            return 'eth'
        case chainIds.POLYGON_MAINNET:
            return 'polygon'
        default:
            return null
    }
}

export default chainIds
