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
    if (wsProviderGroupIndex < wsProviderGroupEndpoints.length - 1) {
        wsProviderGroupIndex++
    } else {
        wsProviderGroupIndex = 0
    }
    logger.notify(
        `[${config.CHAIN_ID}] Rotating Websocket Groups — New Index: ${wsProviderGroupIndex}/${wsProviderGroupEndpoints.length}`
    )
}

export function createWsProviderPool(isRangeMode?: boolean, initialGroupIndex: number | null = null) {
    if (initialGroupIndex !== null) {
        wsProviderGroupIndex = initialGroupIndex
    }
    const endpoints = wsProviderGroupEndpoints[wsProviderGroupIndex] || wsProviderGroupEndpoints[0] || []
    wsProviderPool = new WebsocketProviderPool(endpoints, isRangeMode, 5000)
}

export function teardownWsProviderPool() {
    wsProviderPool?.teardown()
    wsProviderPool = null
}

export function hasHitMaxCalls() {
    return wsProviderPool?.numCalls >= 50000
}