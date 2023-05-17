import Web3 from 'web3'
import config from './config'
import { ERC20_BALANCE_OF_ITEM, ERC1155_BALANCE_OF_ITEM } from './utils/standardAbis'
import { StringKeyMap, shuffle } from '../../shared'

class RpcPool {

    endpoints: string[] = []

    pool: StringKeyMap = {}

    connectionIndex: number

    constructor() {
        this.endpoints = shuffle(
            (config.RPC_POOL_ENDPOINTS?.split(',') || [])
                .map(url => url.trim())
                .filter(url => url!!)
        )
        this._buildPool()
        this.connectionIndex = 0
    }

    index(): number {
        if (this.connectionIndex >= this.endpoints.length) {
            this.connectionIndex = 0
            return this.connectionIndex
        }
        this.connectionIndex++ 
        return this.connectionIndex
    }

    call(address: string, method: string, abi: any) {
        return new (this.pool[this.index()] || this.pool[0]).eth.Contract(abi, address).methods[method]().call()    
    }

    async getBalance(address: string) {
        return (this.pool[this.index()] || this.pool[0]).eth.getBalance(address)
    }

    async balanceOf(tokenAddress: string, ownerAddress: string) {
        return new (this.pool[this.index()] || this.pool[0]).eth.Contract([ERC20_BALANCE_OF_ITEM], tokenAddress).methods.balanceOf(ownerAddress).call()  
    }

    async balanceOf1155(tokenAddress: string, ownerAddress: string, tokenId: any) {
        return new (this.pool[this.index()] || this.pool[0]).eth.Contract([ERC1155_BALANCE_OF_ITEM], tokenAddress).methods.balanceOf(ownerAddress, tokenId).call()  
    }

    async getCode(address: string) {
        return (this.pool[this.index()] || this.pool[0]).eth.getCode(address)
    }

    async getBlock(number: number, withTx: boolean) {
        return (this.pool[this.index()] || this.pool[0]).eth.getBlock(number, withTx)
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
                delay: 1000,
                maxAttempts: 100,
                onTimeout: false,
            },
        }))
    }
}

const rpcPool = new RpcPool()
export default rpcPool