import Web3 from 'web3'
import config from './config'
import { StringKeyMap } from '../../shared'

class RpcPool {

    endpoints: string[] = []

    pool: StringKeyMap = {}

    connectionIndex: number

    constructor() {
        this.endpoints = (config.RPC_POOL_ENDPOINTS?.split(',') || [])
            .map(url => url.trim())
            .filter(url => url!!)
        this._buildPool()
        this.connectionIndex = 0
    }

    getConnection(): Web3 {
        if (this.connectionIndex >= this.endpoints.length) {
            this.connectionIndex = 0
        }
        const connection = this.pool[this.connectionIndex]
        this.connectionIndex++
        return connection
    }

    _buildPool() {
        const pool = {}
        for (let i = 0; i < this.endpoints.length; i++) {
            pool[i] = this._newConnection(this.endpoints[i])
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
                delay: 5000,
                maxAttempts: 5,
                onTimeout: false,
            },
        }))
    }
}

const rpcPool = new RpcPool()

export const getSocketWeb3 = () => rpcPool.getConnection()