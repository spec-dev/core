import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { Abi, AbiItem } from './types'
import { StringMap } from '../types'

// Create redis client.
export const redis = config.ABI_REDIS_URL ? createClient({ url: config.ABI_REDIS_URL }) : null

// Log any redis client errors.
redis?.on('error', (err) => logger.error(`Redis error: ${err}`))

export const abiRedisKeys = {
    ETH_CONTRACTS: 'eth-contracts',
    ETH_FUNCTION_SIGNATURES: 'eth-function-signatures',
    POLYGON_CONTRACTS: 'polygon-contracts',
    POLYGON_FUNCTION_SIGNATURES: 'polygon-function-signatures',
}

export async function saveFunctionSignatures(
    sigsMap: StringMap,
    nsp: string = abiRedisKeys.ETH_FUNCTION_SIGNATURES
): Promise<boolean> {
    if (!Object.keys(sigsMap).length) return true
    try {
        await redis?.hSet(nsp, sigsMap)
    } catch (err) {
        logger.error(`Error saving function signatures: ${err}.`)
        return false
    }
    return true
}

export async function saveAbis(
    abisMap: StringMap,
    nsp: string = abiRedisKeys.ETH_CONTRACTS
): Promise<boolean> {
    if (!Object.keys(abisMap).length) return true
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
    nsp: string = abiRedisKeys.ETH_CONTRACTS
): Promise<Abi | null> {
    if (!address) return null
    try {
        const abiStr = (await redis?.hGet(nsp, address)) || null
        return abiStr ? (JSON.parse(abiStr) as Abi) : null
    } catch (err) {
        logger.error(`Error getting ABI for ${address}: ${err}.`)
        return null
    }
}

export async function getAbis(
    addresses: string[],
    nsp: string = abiRedisKeys.ETH_CONTRACTS
): Promise<{ [key: string]: Abi }> {
    if (!addresses?.length) return {}
    try {
        const results = (await redis?.hmGet(nsp, addresses)) || []
        const abis = {}
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i]
            const abiStr = results[i]
            if (!abiStr) continue
            const abi = JSON.parse(abiStr) as Abi
            abis[address] = abi
        }
        return abis
    } catch (err) {
        logger.error(`Error getting ABIs for addresses ${addresses.join(', ')}: ${err}.`)
        return {}
    }
}

export async function getMissingAbiAddresses(
    addresses: string[],
    nsp: string = abiRedisKeys.ETH_CONTRACTS
): Promise<string[]> {
    if (!addresses?.length) return []
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

export async function getFunctionSignatures(
    signatures: string[],
    nsp: string = abiRedisKeys.ETH_FUNCTION_SIGNATURES
): Promise<{ [key: string]: AbiItem }> {
    if (!signatures?.length) return {}
    try {
        const results = (await redis?.hmGet(nsp, signatures)) || []
        const sigs = {}
        for (let i = 0; i < signatures.length; i++) {
            const sig = signatures[i]
            const sigStr = results[i]
            if (!sigStr) continue
            const abi = JSON.parse(sigStr) as AbiItem
            sigs[sig] = abi
        }
        return sigs
    } catch (err) {
        logger.error(`Error getting function signatures for ${signatures.join(', ')}: ${err}.`)
        return {}
    }
}
