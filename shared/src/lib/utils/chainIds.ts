import { Erc20Token } from '../shared-tables/db/entities/Erc20Token'
import { invert, NULL_ADDRESS } from './formatters'

const chainIds: { [key: string]: string } = {
    ETHEREUM: '1',
    GOERLI: '5',
    POLYGON: '137',
    MUMBAI: '80001',
}

export const supportedChainIds = new Set(Object.values(chainIds))

export const chainSpecificSchemas = {
    ETHEREUM: 'ethereum',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
}

export const chainSpecificNamespaces = {
    ETHEREUM: 'eth',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
}

export const nameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon',
    [chainIds.MUMBAI]: 'Mumbai',
}

export const fullNameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum mainnet',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon mainnet',
    [chainIds.MUMBAI]: 'Mumbai',
}

export const nativeTokenSymbolForChainId = {
    [chainIds.ETHEREUM]: 'ETH',
    [chainIds.GOERLI]: 'ETH',
    [chainIds.POLYGON]: 'MATIC',
    [chainIds.MUMBAI]: 'MATIC',
}

export const chainIdForSchema = {
    [chainSpecificSchemas.ETHEREUM]: chainIds.ETHEREUM,
    [chainSpecificSchemas.GOERLI]: chainIds.GOERLI,
    [chainSpecificSchemas.POLYGON]: chainIds.POLYGON,
    [chainSpecificSchemas.MUMBAI]: chainIds.MUMBAI,
}

export const schemaForChainId = invert(chainIdForSchema)

export const namespaceForChainId = {
    [chainIds.ETHEREUM]: chainSpecificNamespaces.ETHEREUM,
    [chainIds.GOERLI]: chainSpecificNamespaces.GOERLI,
    [chainIds.POLYGON]: chainSpecificNamespaces.POLYGON,
    [chainIds.MUMBAI]: chainSpecificNamespaces.MUMBAI,
}

export const chainIdLiveObjectVersionPropertyOptions = [
    chainIds.ETHEREUM,
    chainIds.GOERLI,
    chainIds.POLYGON,
    chainIds.MUMBAI,
].map((chainId) => ({
    name: nameForChainId[chainId],
    value: chainId,
    type: 'string',
}))

export const avgBlockTimesForChainId = {
    [chainIds.ETHEREUM]: 12,
    [chainIds.GOERLI]: 12,
    [chainIds.POLYGON]: 2,
    [chainIds.MUMBAI]: 2,
}

export const contractNamespaceForChainId = (chainId: string): string | null => {
    const nsp = namespaceForChainId[chainId]
    if (!nsp) return null
    return [nsp, 'contracts'].join('.')
}

export const isContractNamespace = (nsp: string): boolean => {
    for (const chainSpecificNsp of Object.values(chainSpecificNamespaces)) {
        if (nsp.startsWith(`${chainSpecificNsp}.contracts.`)) {
            return true
        }
    }
    return false
}

export const getNativeTokenForChain = (chainId: string): Erc20Token | null => {
    const symbol = nativeTokenSymbolForChainId[chainId]
    if (!symbol) return null
    const nativeToken = new Erc20Token()
    nativeToken.name = symbol
    nativeToken.symbol = symbol
    nativeToken.address = NULL_ADDRESS
    nativeToken.decimals = 18
    return nativeToken
}

export default chainIds
