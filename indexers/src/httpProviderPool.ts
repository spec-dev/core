import config from './config'
import { newEvmWeb3ForChainId, EvmWeb3, logger } from '../../shared'
import chalk from 'chalk'

let web3: EvmWeb3

let groupIndex = 0

let connectionIndex = 0

let numInternalGroupRotations = 0

const groupEndpoints = config.HTTP_PROVIDER_POOL.split('|')
    .map(group => group.split(',').map(url => url.trim()).filter(url => !!url))

export function getWeb3(): EvmWeb3 {
    return web3
}

export function resetNumInternalGroupRotations() {
    numInternalGroupRotations = 0
}

export function rotateWeb3Provider() {
    const currentGroupEndpoints = groupEndpoints[groupIndex] || groupEndpoints[0] || []
    numInternalGroupRotations++

    // Rotate *internally* within the current group if all endpoints haven't been exhausted.
    if (numInternalGroupRotations < currentGroupEndpoints.length) {
        if (connectionIndex < currentGroupEndpoints.length) {
            connectionIndex++
        } else {
            connectionIndex = 0
        }
        logger.warn(chalk.yellow(
            `[${config.CHAIN_ID}] Provider Rotation (HTTP) — New Index: ${connectionIndex}/${currentGroupEndpoints.length - 1}`
        ))

        const newCurrentEndpoints = currentGroupEndpoints[connectionIndex] || currentGroupEndpoints[0]
        logger.info(chalk.magenta(`New endpoint: ${newCurrentEndpoints}`))
        return
    }

    // Rotate to first connection in next group.
    connectionIndex = 0
    if (groupIndex < groupEndpoints.length) {
        groupIndex++
    } else {
        groupIndex = 0
    }
    resetNumInternalGroupRotations()
    logger.notify(chalk.yellow(
        `[${config.CHAIN_ID}] Group Rotation (HTTP) — New Index: ${groupIndex}/${groupEndpoints.length}`
    ))

    const newGroupEndpoints = groupEndpoints[groupIndex] || groupEndpoints[0] || []
    const newCurrentEndpoints = newGroupEndpoints[connectionIndex] || newGroupEndpoints[0]
    logger.info(chalk.magenta(`New endpoint: ${newCurrentEndpoints}`))
}

export function createWeb3Provider(isRangeMode?: boolean) {
    const currentGroupEndpoints = groupEndpoints[groupIndex] || groupEndpoints[0] || []
    const currentEndpoint = currentGroupEndpoints[connectionIndex] || currentGroupEndpoints[0]
    web3 = newEvmWeb3ForChainId(config.CHAIN_ID, currentEndpoint, isRangeMode)
}

export function teardownWeb3Provider() {
    web3 = null
}