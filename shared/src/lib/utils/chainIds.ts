import { Erc20Token } from '../shared-tables/db/entities/Erc20Token'
import config from '../config'

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

const invert = (obj1: object): object => {
    const obj2 = {}
    for (const key in obj1) {
        obj2[obj1[key]] = key
    }
    return obj2
}

const chainIds: { [key: string]: string } = {
    ETHEREUM: '1',
    GOERLI: '5',
    POLYGON: '137',
    MUMBAI: '80001',
    BASE: '8453',
    OPTIMISM: '10',
    ARBITRUM: '42161',
    PGN: '424',
    CELO: '42220',
    LINEA: '59144',
}

export const supportedChainIds = new Set(Object.values(chainIds))

export const chainSpecificSchemas = {
    ETHEREUM: 'ethereum',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
    OPTIMISM: 'optimism',
    ARBITRUM: 'arbitrum',
    PGN: 'pgn',
    CELO: 'celo',
    LINEA: 'linea',
}

export const chainSpecificNamespaces = {
    ETHEREUM: 'eth',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
    OPTIMISM: 'optimism',
    ARBITRUM: 'arbitrum',
    PGN: 'pgn',
    CELO: 'celo',
    LINEA: 'linea',
}

export const nameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
    [chainIds.OPTIMISM]: 'Optimism',
    [chainIds.ARBITRUM]: 'Arbitrum',
    [chainIds.PGN]: 'PGN',
    [chainIds.CELO]: 'Celo',
    [chainIds.LINEA]: 'Linea',
}

export const fullNameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum mainnet',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon mainnet',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
    [chainIds.OPTIMISM]: 'Optimism',
    [chainIds.ARBITRUM]: 'Arbitrum',
    [chainIds.PGN]: 'PGN',
    [chainIds.CELO]: 'Celo',
    [chainIds.LINEA]: 'Linea',
}

export const nativeTokenSymbolForChainId = {
    [chainIds.ETHEREUM]: 'ETH',
    [chainIds.GOERLI]: 'ETH',
    [chainIds.POLYGON]: 'MATIC',
    [chainIds.MUMBAI]: 'MATIC',
    [chainIds.BASE]: 'ETH',
    [chainIds.OPTIMISM]: 'ETH',
    [chainIds.ARBITRUM]: 'ETH',
    [chainIds.PGN]: 'ETH',
    [chainIds.CELO]: 'CELO',
    [chainIds.LINEA]: 'ETH',
}

export const chainIdForSchema = {
    [chainSpecificSchemas.ETHEREUM]: chainIds.ETHEREUM,
    [chainSpecificSchemas.GOERLI]: chainIds.GOERLI,
    [chainSpecificSchemas.POLYGON]: chainIds.POLYGON,
    [chainSpecificSchemas.MUMBAI]: chainIds.MUMBAI,
    [chainSpecificSchemas.BASE]: chainIds.BASE,
    [chainSpecificSchemas.OPTIMISM]: chainIds.OPTIMISM,
    [chainSpecificSchemas.ARBITRUM]: chainIds.ARBITRUM,
    [chainSpecificSchemas.PGN]: chainIds.PGN,
    [chainSpecificSchemas.CELO]: chainIds.CELO,
    [chainSpecificSchemas.LINEA]: chainIds.LINEA,
}

export const schemaForChainId = invert(chainIdForSchema)

export const namespaceForChainId = {
    [chainIds.ETHEREUM]: chainSpecificNamespaces.ETHEREUM,
    [chainIds.GOERLI]: chainSpecificNamespaces.GOERLI,
    [chainIds.POLYGON]: chainSpecificNamespaces.POLYGON,
    [chainIds.MUMBAI]: chainSpecificNamespaces.MUMBAI,
    [chainIds.BASE]: chainSpecificNamespaces.BASE,
    [chainIds.OPTIMISM]: chainSpecificNamespaces.OPTIMISM,
    [chainIds.ARBITRUM]: chainSpecificNamespaces.ARBITRUM,
    [chainIds.PGN]: chainSpecificNamespaces.PGN,
    [chainIds.CELO]: chainSpecificNamespaces.CELO,
    [chainIds.LINEA]: chainSpecificNamespaces.LINEA,
}
const chainIdForNamespace = invert(namespaceForChainId)

export const chainIdLiveObjectVersionPropertyOptions = [
    chainIds.ETHEREUM,
    chainIds.GOERLI,
    chainIds.POLYGON,
    chainIds.MUMBAI,
    chainIds.BASE,
    chainIds.OPTIMISM,
    chainIds.ARBITRUM,
    chainIds.PGN,
    chainIds.CELO,
    chainIds.LINEA,
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
    [chainIds.OPTIMISM]: 2,
    [chainIds.ARBITRUM]: 0.3,
    [chainIds.PGN]: 2,
    [chainIds.CELO]: 5,
    [chainIds.LINEA]: 12,
}

const basePrimitives = [
    { table: 'blocks', appendOnly: true, crossChain: false },
    { table: 'transactions', appendOnly: true, crossChain: false },
    { table: 'logs', appendOnly: true, crossChain: false },
    // { table: 'traces', appendOnly: true, crossChain: false },
    // { table: 'contracts', appendOnly: true, crossChain: false },
]

const tokenPrimitives = [
    // { table: 'tokens.erc20_tokens', appendOnly: false, crossChain: true },
    // { table: 'tokens.erc20_balance', appendOnly: false, crossChain: true },
    // { table: 'tokens.nft_collections', appendOnly: false, crossChain: true },
    // { table: 'tokens.nft_balance', appendOnly: false, crossChain: true },
    // { table: 'tokens.token_transfers', appendOnly: true, crossChain: true },
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
    [chainIds.OPTIMISM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.OPTIMISM], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.ARBITRUM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.ARBITRUM], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.PGN]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.PGN], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.CELO]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.CELO], p.table].join('.'),
        })),
        ...tokenPrimitives,
    ],
    [chainIds.LINEA]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.LINEA], p.table].join('.'),
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
