import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { Abi } from './types'
import { StringMap } from '../types'

// Create redis client.
export const redis = config.ABI_REDIS_URL ? createClient({ url: config.ABI_REDIS_URL }) : null

// Log any redis client errors.
redis?.on('error', (err) => logger.error(`Redis error: ${err}`))

const keys = {
    ETH_CONTRACTS: 'eth-contracts',
}

export async function saveAbis(
    abisMap: StringMap,
    nsp: string = keys.ETH_CONTRACTS
): Promise<boolean> {
    try {
        await redis?.hSet(nsp, abisMap)
    } catch (err) {
        logger.error(`Error saving ABIs: ${err}.`)
        return false
    }
    return true
}

export async function getAbi(
    address: string,
    nsp: string = keys.ETH_CONTRACTS
): Promise<Abi | null> {
    try {
        const abiStr = (await redis?.hGet(nsp, address)) || null
        return abiStr ? (JSON.parse(abiStr) as Abi) : null
    } catch (err) {
        logger.error(`Error getting ABI for ${address}: ${err}.`)
        return null
    }
}

export async function getMissingAbiAddresses(
    addresses: string[],
    nsp: string = keys.ETH_CONTRACTS
): Promise<string[]> {
    let results = []
    try {
        results = (await redis?.hmGet(nsp, addresses)) || []
    } catch (err) {
        logger.error(`Error getting ABIs: ${err}.`)
        return []
    }
    let missingAddresses = []
    for (let i = 0; i < addresses.length; i++) {
        if (!results[i]) {
            missingAddresses.push(addresses[i])
        }
    }
    return missingAddresses
}
