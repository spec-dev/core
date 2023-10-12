import { Erc20Token } from '../shared-tables/db/entities/Erc20Token'
import { invert, NULL_ADDRESS } from './formatters'
import config from '../config'

const chainIds: { [key: string]: string } = {
    ETHEREUM: '1',
    GOERLI: '5',
    POLYGON: '137',
    MUMBAI: '80001',
    BASE: '8453',
}

export const supportedChainIds = new Set(Object.values(chainIds))

export const chainSpecificSchemas = {
    ETHEREUM: 'ethereum',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
}

export const chainSpecificNamespaces = {
    ETHEREUM: 'eth',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
}

export const nameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
}

export const fullNameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum mainnet',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon mainnet',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
}

export const nativeTokenSymbolForChainId = {
    [chainIds.ETHEREUM]: 'ETH',
    [chainIds.GOERLI]: 'ETH',
    [chainIds.POLYGON]: 'MATIC',
    [chainIds.MUMBAI]: 'MATIC',
    [chainIds.BASE]: 'ETH',
}

export const chainIdForSchema = {
    [chainSpecificSchemas.ETHEREUM]: chainIds.ETHEREUM,
    [chainSpecificSchemas.GOERLI]: chainIds.GOERLI,
    [chainSpecificSchemas.POLYGON]: chainIds.POLYGON,
    [chainSpecificSchemas.MUMBAI]: chainIds.MUMBAI,
    [chainSpecificSchemas.BASE]: chainIds.BASE,
}

export const schemaForChainId = invert(chainIdForSchema)

export const namespaceForChainId = {
    [chainIds.ETHEREUM]: chainSpecificNamespaces.ETHEREUM,
    [chainIds.GOERLI]: chainSpecificNamespaces.GOERLI,
    [chainIds.POLYGON]: chainSpecificNamespaces.POLYGON,
    [chainIds.MUMBAI]: chainSpecificNamespaces.MUMBAI,
    [chainIds.BASE]: chainSpecificNamespaces.BASE,
}
const chainIdForNamespace = invert(namespaceForChainId)

export const chainIdLiveObjectVersionPropertyOptions = [
    chainIds.ETHEREUM,
    chainIds.GOERLI,
    chainIds.POLYGON,
    chainIds.MUMBAI,
    chainIds.BASE,
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
    [chainIds.BASE]: 2,
}

const basePrimitives = [
    { table: 'blocks', appendOnly: true, crossChain: false },
    { table: 'transactions', appendOnly: true, crossChain: false },
    { table: 'traces', appendOnly: true, crossChain: false },
    { table: 'logs', appendOnly: true, crossChain: false },
    { table: 'contracts', appendOnly: true, crossChain: false },
]

const tokenPrimitives = [
    { table: 'tokens.erc20_tokens', appendOnly: false, crossChain: true },
    { table: 'tokens.erc20_balance', appendOnly: false, crossChain: true },
    { table: 'tokens.nft_collections', appendOnly: false, crossChain: true },
    { table: 'tokens.nft_balance', appendOnly: false, crossChain: true },
    { table: 'tokens.token_transfers', appendOnly: true, crossChain: true },
]

export const primitivesForChainId = {
    [chainIds.ETHEREUM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.ETHEREUM], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.GOERLI]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.GOERLI], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.POLYGON]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.POLYGON], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.MUMBAI]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.MUMBAI], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.BASE]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.BASE], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
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

export const chainIdForContractNamespace = (nsp: string): string | null => {
    const splitNsp = nsp.split('.')
    if (splitNsp[1] !== 'contracts') return null
    return chainIdForNamespace[splitNsp[0]] || null
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

export const currentChainSchema = (): string => {
    const chainId = config.CHAIN_ID
    return schemaForChainId[chainId] || chainSpecificSchemas.ETHEREUM
}

export default chainIds
