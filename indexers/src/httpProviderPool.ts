import config from './config'
import { newEvmWeb3ForChainId, EvmWeb3, logger } from '../../shared'

let web3: EvmWeb3

let groupIndex = 0

let connectionIndex = 0

const groupEndpoints = config.HTTP_PROVIDER_POOL.split('|')
    .map(group => group.split(',').map(url => url.trim()).filter(url => !!url))

export function getWeb3(): EvmWeb3 {
    return web3
}

export function rotateWeb3Provider() {
    const currentGroupEndpoints = groupEndpoints[groupIndex] || groupEndpoints[0] || []

    // Rotate to next connection within current group.
    if (connectionIndex < currentGroupEndpoints.length) {
        connectionIndex++
        logger.notify(
            `[${config.CHAIN_ID}] Rotating HTTP Providers — New Index: ${connectionIndex}/${currentGroupEndpoints.length}`
        )    
        return
    }

    // Rotate to first connection in next group.
    if (groupIndex >= groupEndpoints.length) {
        groupIndex = 0
    } else {
        groupIndex++
    }
    logger.notify(
        `[${config.CHAIN_ID}] Rotating HTTP Groups — New Index: ${groupIndex}/${groupEndpoints.length}`
    )
    connectionIndex = 0
}

export function createWeb3Provider(isRangeMode?: boolean) {
    const currentGroupEndpoints = groupEndpoints[groupIndex] || groupEndpoints[0] || []
    const currentEndpoint = currentGroupEndpoints[connectionIndex] || currentGroupEndpoints[0]
    web3 = newEvmWeb3ForChainId(config.CHAIN_ID, currentEndpoint, isRangeMode)
}

export function teardownWeb3Provider() {
    web3 = null
}