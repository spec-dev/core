import config from './config'
import { logger, WebsocketProviderPool } from '../../shared'

let wsProviderPool: WebsocketProviderPool

let wsProviderGroupIndex = 0

const wsProviderGroupEndpoints = config.WS_PROVIDER_POOL.split('|')
    .map(group => group.split(',').map(url => url.trim()).filter(url => !!url))

export function getWsProviderPool(): WebsocketProviderPool {
    return wsProviderPool
}

export function rotateWsProviderGroups() {
    if (wsProviderGroupIndex >= wsProviderGroupEndpoints.length) {
        wsProviderGroupIndex = 0
    } else {
        wsProviderGroupIndex++
    }
    logger.notify(
        `[${config.CHAIN_ID}] Rotating Websocket Groups — New Index: ${wsProviderGroupIndex}/${wsProviderGroupEndpoints.length}`
    )
}

export function createWsProviderPool(isRangeMode?: boolean) {
    const endpoints = wsProviderGroupEndpoints[wsProviderGroupIndex] || wsProviderGroupEndpoints[0] || []
    wsProviderPool = new WebsocketProviderPool(endpoints, isRangeMode)
}

export function teardownWsProviderPool() {
    wsProviderPool?.teardown()
    wsProviderPool = null
}

export function hasHitMaxCalls() {
    return wsProviderPool?.numCalls >= config.MAX_RPC_POOL_CALLS
}