const chainIds: { [key: string]: number } = {
    ETH_MAINNET: 1,
    POLYGON_MAINNET: 137,
    POLYGON_MUMBAI: 80001,
}

export const productionChainNameForChainId = (chainId: number): string | null => {
    switch (chainId) {
        case chainIds.ETH_MAINNET:
            return 'eth'
        case chainIds.POLYGON_MAINNET:
        case chainIds.POLYGON_MUMBAI:
            return 'polygon'
        default:
            return null
    }
}

export default chainIds
