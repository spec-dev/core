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
    ARBITRUM_SEPOLIA: '421614',
    PGN: '424',
    CELO: '42220',
    LINEA: '59144',
    SEPOLIA: '11155111',
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
    ARBITRUM_SEPOLIA: 'arbitrumsepolia',
    PGN: 'pgn',
    CELO: 'celo',
    LINEA: 'linea',
    SEPOLIA: 'sepolia',
}

export const chainSpecificNamespaces = {
    ETHEREUM: 'eth',
    GOERLI: 'goerli',
    POLYGON: 'polygon',
    MUMBAI: 'mumbai',
    BASE: 'base',
    OPTIMISM: 'optimism',
    ARBITRUM: 'arbitrum',
    ARBITRUM_SEPOLIA: 'arbitrumsepolia',
    PGN: 'pgn',
    CELO: 'celo',
    LINEA: 'linea',
    SEPOLIA: 'sepolia',
}

export const nameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
    [chainIds.OPTIMISM]: 'Optimism',
    [chainIds.ARBITRUM]: 'Arbitrum',
    [chainIds.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia',
    [chainIds.PGN]: 'PGN',
    [chainIds.CELO]: 'Celo',
    [chainIds.LINEA]: 'Linea',
    [chainIds.SEPOLIA]: 'Sepolia',
}

export const fullNameForChainId = {
    [chainIds.ETHEREUM]: 'Ethereum mainnet',
    [chainIds.GOERLI]: 'Goerli',
    [chainIds.POLYGON]: 'Polygon mainnet',
    [chainIds.MUMBAI]: 'Mumbai',
    [chainIds.BASE]: 'Base',
    [chainIds.OPTIMISM]: 'Optimism',
    [chainIds.ARBITRUM]: 'Arbitrum',
    [chainIds.ARBITRUM_SEPOLIA]: 'Arbitrum Sepolia',
    [chainIds.PGN]: 'PGN',
    [chainIds.CELO]: 'Celo',
    [chainIds.LINEA]: 'Linea',
    [chainIds.SEPOLIA]: 'Sepolia',
}

export const nativeTokenSymbolForChainId = {
    [chainIds.ETHEREUM]: 'ETH',
    [chainIds.GOERLI]: 'ETH',
    [chainIds.POLYGON]: 'MATIC',
    [chainIds.MUMBAI]: 'MATIC',
    [chainIds.BASE]: 'ETH',
    [chainIds.OPTIMISM]: 'ETH',
    [chainIds.ARBITRUM]: 'ETH',
    [chainIds.ARBITRUM_SEPOLIA]: 'ETH',
    [chainIds.PGN]: 'ETH',
    [chainIds.CELO]: 'CELO',
    [chainIds.LINEA]: 'ETH',
    [chainIds.SEPOLIA]: 'ETH',
}

export const chainIdForSchema = {
    [chainSpecificSchemas.ETHEREUM]: chainIds.ETHEREUM,
    [chainSpecificSchemas.GOERLI]: chainIds.GOERLI,
    [chainSpecificSchemas.POLYGON]: chainIds.POLYGON,
    [chainSpecificSchemas.MUMBAI]: chainIds.MUMBAI,
    [chainSpecificSchemas.BASE]: chainIds.BASE,
    [chainSpecificSchemas.OPTIMISM]: chainIds.OPTIMISM,
    [chainSpecificSchemas.ARBITRUM]: chainIds.ARBITRUM,
    [chainSpecificSchemas.ARBITRUM_SEPOLIA]: chainIds.ARBITRUM_SEPOLIA,
    [chainSpecificSchemas.PGN]: chainIds.PGN,
    [chainSpecificSchemas.CELO]: chainIds.CELO,
    [chainSpecificSchemas.LINEA]: chainIds.LINEA,
    [chainSpecificSchemas.SEPOLIA]: chainIds.SEPOLIA,
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
    [chainIds.ARBITRUM_SEPOLIA]: chainSpecificNamespaces.ARBITRUM_SEPOLIA,
    [chainIds.PGN]: chainSpecificNamespaces.PGN,
    [chainIds.CELO]: chainSpecificNamespaces.CELO,
    [chainIds.LINEA]: chainSpecificNamespaces.LINEA,
    [chainIds.SEPOLIA]: chainSpecificNamespaces.SEPOLIA,
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
    chainIds.ARBITRUM_SEPOLIA,
    chainIds.PGN,
    chainIds.CELO,
    chainIds.LINEA,
    chainIds.SEPOLIA,
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
    [chainIds.ARBITRUM_SEPOLIA]: 2,
    [chainIds.PGN]: 2,
    [chainIds.CELO]: 5,
    [chainIds.LINEA]: 12,
    [chainIds.SEPOLIA]: 12,
}

const basePrimitives = [
    { table: 'blocks', appendOnly: true, crossChain: false },
    { table: 'transactions', appendOnly: true, crossChain: false },
    { table: 'logs', appendOnly: true, crossChain: false },
]

export const primitivesForChainId = {
    [chainIds.ETHEREUM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.ETHEREUM], p.table].join('.'),
        })),
    ],
    [chainIds.GOERLI]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.GOERLI], p.table].join('.'),
        })),
    ],
    [chainIds.POLYGON]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.POLYGON], p.table].join('.'),
        })),
    ],
    [chainIds.MUMBAI]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.MUMBAI], p.table].join('.'),
        })),
    ],
    [chainIds.BASE]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.BASE], p.table].join('.'),
        })),
    ],
    [chainIds.OPTIMISM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.OPTIMISM], p.table].join('.'),
        })),
    ],
    [chainIds.ARBITRUM]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.ARBITRUM], p.table].join('.'),
        })),
    ],
    [chainIds.ARBITRUM_SEPOLIA]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.ARBITRUM_SEPOLIA], p.table].join('.'),
        })),
    ],
    [chainIds.PGN]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.PGN], p.table].join('.'),
        })),
    ],
    [chainIds.CELO]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.CELO], p.table].join('.'),
        })),
    ],
    [chainIds.LINEA]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.LINEA], p.table].join('.'),
        })),
    ],
    [chainIds.SEPOLIA]: [
        ...basePrimitives.map((p) => ({
            ...p,
            table: [schemaForChainId[chainIds.SEPOLIA], p.table].join('.'),
        })),
    ],
}

export const isContractNamespace = (nsp: string): boolean => {
    return nsp.includes('.')
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
