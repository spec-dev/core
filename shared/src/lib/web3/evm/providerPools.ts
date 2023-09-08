import config from '../../config'
import { newEvmWeb3ForChainId } from './EvmWeb3'
import { StringKeyMap } from '../../types'
import { ERC20_BALANCE_OF_ITEM, ERC1155_BALANCE_OF_ITEM } from '../../utils/standardAbis'

class WebsocketProviderPool {
    endpoints: string[]

    connectionIndex: number = 0

    pool: StringKeyMap = {}

    numCalls: number = 0

    isRangeMode: boolean

    constructor(endpoints: string[], isRangeMode?: boolean) {
        this.endpoints = endpoints
        this.isRangeMode = isRangeMode || false
        this._buildPool()
    }

    index(): number {
        if (this.connectionIndex >= this.endpoints.length) {
            this.connectionIndex = 0
            return this.connectionIndex
        }
        this.connectionIndex++
        return this.connectionIndex
    }

    teardown() {
        for (const i in this.pool) {
            const provider = this.pool[i]?.web3?.currentProvider as any
            provider?.removeAllListeners && provider.removeAllListeners()
            provider?.disconnect && provider.disconnect()
            this.pool[i] = null
        }
    }

    call(address: string, method: string, abi: any) {
        this.numCalls++
        return new (this.pool[this.index()] || this.pool[0]).web3.eth.Contract(
            abi,
            address
        ).methods[method]().call()
    }

    _buildPool() {
        const pool = {}
        for (let i = 0; i < this.endpoints.length; i++) {
            pool[i] = newEvmWeb3ForChainId(config.CHAIN_ID, this.endpoints[i], this.isRangeMode)
        }
        this.pool = pool
    }

    async getBlock(hash?: string, number?: number, withTxs: boolean = true) {
        this.numCalls++
        return (this.pool[this.index()] || this.pool[0]).getBlock(
            hash,
            number,
            config.CHAIN_ID,
            withTxs
        )
    }

    async getBalance(address: string) {
        this.numCalls++
        return (this.pool[this.index()] || this.pool[0]).web3.eth.getBalance(address)
    }

    async balanceOf(tokenAddress: string, ownerAddress: string) {
        this.numCalls++
        return new (this.pool[this.index()] || this.pool[0]).web3.eth.Contract(
            [ERC20_BALANCE_OF_ITEM],
            tokenAddress
        ).methods
            .balanceOf(ownerAddress)
            .call()
    }

    async balanceOf1155(tokenAddress: string, ownerAddress: string, tokenId: any) {
        this.numCalls++
        return new (this.pool[this.index()] || this.pool[0]).web3.eth.Contract(
            [ERC1155_BALANCE_OF_ITEM],
            tokenAddress
        ).methods
            .balanceOf(ownerAddress, tokenId)
            .call()
    }

    async getCode(address: string) {
        this.numCalls++
        return (this.pool[this.index()] || this.pool[0]).web3.eth.getCode(address)
    }
}

export default WebsocketProviderPool
