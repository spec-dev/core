const chainIds: { [key: string]: string } = {
    ETHEREUM: '1',
    POLYGON: '137',
    MUMBAI: '80001',
}

export const supportedChainIds = new Set(Object.values(chainIds))

export default chainIds
