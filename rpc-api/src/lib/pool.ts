import Web3 from 'web3'
import config from './config'
import { StringKeyMap, chainIds, AbiItem } from '../../../shared'

const getEndpointsList = (endpoints: string) => {
    return (endpoints || '')
        .split(',')
        .map(url => url.trim())
        .filter(url => !!url)
        .slice(0, config.NUM_RPC_ENDPOINTS_PER_CHAIN)
}

class MultiChainRpcPool {

    endpoints: StringKeyMap

    pool: StringKeyMap = {}

    connectionIndexes: StringKeyMap

    numCalls: number = 0

    constructor() {
        this.endpoints = {
            [chainIds.ETHEREUM]: getEndpointsList(config.ETHEREUM_RPC_POOL_ENDPOINTS),
            [chainIds.GOERLI]: getEndpointsList(config.GOERLI_RPC_POOL_ENDPOINTS),
            [chainIds.POLYGON]: getEndpointsList(config.POLYGON_RPC_POOL_ENDPOINTS),
            [chainIds.MUMBAI]: getEndpointsList(config.MUMBAI_RPC_POOL_ENDPOINTS),
            [chainIds.BASE]: getEndpointsList(config.BASE_RPC_POOL_ENDPOINTS),
            [chainIds.OPTIMISM]: getEndpointsList(config.OPTIMISM_RPC_POOL_ENDPOINTS),
            [chainIds.ARBITRUM]: getEndpointsList(config.ARBITRUM_RPC_POOL_ENDPOINTS),
            [chainIds.ARBITRUM_SEPOLIA]: getEndpointsList(config.ARBITRUM_SEPOLIA_RPC_POOL_ENDPOINTS),
            [chainIds.PGN]: getEndpointsList(config.PGN_RPC_POOL_ENDPOINTS),
            [chainIds.CELO]: getEndpointsList(config.CELO_RPC_POOL_ENDPOINTS),
            [chainIds.LINEA]: getEndpointsList(config.LINEA_RPC_POOL_ENDPOINTS),
            [chainIds.SEPOLIA]: getEndpointsList(config.SEPOLIA_RPC_POOL_ENDPOINTS),
        }
        this._buildPool()
        this.connectionIndexes = {}
        Object.keys(this.endpoints).forEach(chainId => {
            this.connectionIndexes[chainId] = 0
        })
    }

    call(chainId: string, contractAddress: string, abiItem: AbiItem, inputs: any[]) {
        this.numCalls++
        return new (
            this.pool[chainId][this.index(chainId)] || this.pool[chainId][0]
        ).eth.Contract(
            [abiItem], 
            contractAddress,
        ).methods[abiItem.name](...inputs).call()
    }

    index(chainId: string): number {
        if (this.connectionIndexes[chainId] >= this.endpoints.length) {
            this.connectionIndexes[chainId] = 0
            return this.connectionIndexes[chainId]
        }
        this.connectionIndexes[chainId] = this.connectionIndexes[chainId] + 1
        return this.connectionIndexes[chainId]
    }

    teardown() {
        for (const chainId in this.pool) {
            for (const i in this.pool[chainId]) {
                const provider = this.pool[chainId][i].currentProvider as any
                provider?.removeAllListeners && provider.removeAllListeners()
                provider?.disconnect && provider.disconnect()
                this.pool[chainId][i] = null
            }    
        }
    }

    _buildPool() {
        const pool = {}
        for (const chainId in this.endpoints) {
            pool[chainId] = {}
            for (let i = 0; i < this.endpoints[chainId].length; i++) {
                pool[chainId][i] = this._newConnection(this.endpoints[chainId][i])
            }
        }
        this.pool = pool
    }

    _newConnection(url: string): Web3 {
        return new Web3(new Web3.providers.WebsocketProvider(url, {
            clientConfig: {
                keepalive: true,
                keepaliveInterval: 60000,
            },
            reconnect: {
                auto: true,
                delay: 1000,
                maxAttempts: 100,
                onTimeout: true,
            },
        }))
    }
}

let rpcPool: MultiChainRpcPool

export function getRpcPool(): MultiChainRpcPool {
    return rpcPool
}

export function createRpcPool() {
    rpcPool = new MultiChainRpcPool()
}

export function teardownRpcPool() {
    rpcPool?.teardown()
    rpcPool = null
}

export function hasHitMaxCalls() {
    return rpcPool?.numCalls >= config.MAX_RPC_POOL_CALLS
}

createRpcPool()