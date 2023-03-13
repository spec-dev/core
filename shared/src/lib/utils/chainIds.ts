import { invert } from './formatters'

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

export default chainIds
