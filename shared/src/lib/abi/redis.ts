import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { Abi, AbiItem } from './types'
import { StringMap } from '../types'
import { specEnvs } from '../utils/env'
import chainIds from '../utils/chainIds'

// Create redis client.
const configureRedis = config.ENV === specEnvs.LOCAL || config.ABI_REDIS_HOST !== 'localhost'
export const redis = configureRedis ? createClient({ url: config.ABI_REDIS_URL }) : null

// Log any redis client errors.
redis?.on('error', (err) => logger.error(`Redis error: ${err}`))

export const abiRedisKeys = {
    ETH_CONTRACTS: 'eth-contracts',
    ETH_FUNCTION_SIGNATURES: 'eth-function-signatures',
    GOERLI_CONTRACTS: 'goerli-contracts',
    GOERLI_FUNCTION_SIGNATURES: 'goerli-function-signatures',
    POLYGON_CONTRACTS: 'polygon-contracts',
    POLYGON_FUNCTION_SIGNATURES: 'polygon-function-signatures',
    MUMBAI_CONTRACTS: 'mumbai-contracts',
    MUMBAI_FUNCTION_SIGNATURES: 'mumbai-function-signatures',
    CONTRACT_GROUPS_PREFIX: 'contract-groups',
}

const contractsKeyForChainId = (chainId: string): string | null => {
    switch (chainId) {
        case chainIds.ETHEREUM:
            return abiRedisKeys.ETH_CONTRACTS
        case chainIds.GOERLI:
            return abiRedisKeys.GOERLI_CONTRACTS
        case chainIds.POLYGON:
            return abiRedisKeys.POLYGON_CONTRACTS
        case chainIds.MUMBAI:
            return abiRedisKeys.MUMBAI_CONTRACTS
        default:
            return null
    }
}

const functionSigsKeyForChainId = (chainId: string): string | null => {
    switch (chainId) {
        case chainIds.ETHEREUM:
            return abiRedisKeys.ETH_FUNCTION_SIGNATURES
        case chainIds.GOERLI:
            return abiRedisKeys.GOERLI_FUNCTION_SIGNATURES
        case chainIds.POLYGON:
            return abiRedisKeys.POLYGON_FUNCTION_SIGNATURES
        case chainIds.MUMBAI:
            return abiRedisKeys.MUMBAI_FUNCTION_SIGNATURES
        default:
            return null
    }
}

export async function saveFunctionSignatures(
    sigsMap: StringMap,
    chainId: string = chainIds.ETHEREUM
): Promise<boolean> {
    if (!Object.keys(sigsMap).length) return true
    const nsp = functionSigsKeyForChainId(chainId)
    if (!nsp) return false
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
    chainId: string = chainIds.ETHEREUM
): Promise<boolean> {
    if (!Object.keys(abisMap).length) return true
    const nsp = contractsKeyForChainId(chainId)
    if (!nsp) return false
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
    chainId: string = chainIds.ETHEREUM
): Promise<Abi | null> {
    if (!address) return null
    const nsp = contractsKeyForChainId(chainId)
    if (!nsp) return null
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
    chainId: string = chainIds.ETHEREUM
): Promise<{ [key: string]: Abi } | null> {
    if (!addresses?.length) return {}
    const nsp = contractsKeyForChainId(chainId)
    if (!nsp) return {}
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
        return null
    }
}

export async function removeAbis(
    addresses: string[],
    chainId: string = chainIds.ETHEREUM
): Promise<boolean> {
    if (!addresses.length) return
    const nsp = contractsKeyForChainId(chainId)
    if (!nsp) return true
    try {
        await redis?.hDel(nsp, addresses)
    } catch (err) {
        logger.error(`Error deleting ABIs: ${err}.`)
        return false
    }
    return true
}

export async function getMissingAbiAddresses(
    addresses: string[],
    chainId: string = chainIds.ETHEREUM
): Promise<string[]> {
    if (!addresses?.length) return []
    const nsp = contractsKeyForChainId(chainId)
    if (!nsp) return []
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
    chainId: string = chainIds.ETHEREUM
): Promise<{ [key: string]: AbiItem }> {
    if (!signatures?.length) return {}
    const nsp = functionSigsKeyForChainId(chainId)
    if (!nsp) return {}
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

export async function getContractGroupAbi(
    contractGroup: string,
    chainId: string = chainIds.ETHEREUM
): Promise<Abi | null> {
    const key = [abiRedisKeys.CONTRACT_GROUPS_PREFIX, chainId].join('-')
    try {
        const abiStr = (await redis?.hGet(key, contractGroup)) || null
        return abiStr ? (JSON.parse(abiStr) as Abi) : []
    } catch (err) {
        logger.error(`Error getting contract group ABI for ${contractGroup}: ${err}.`)
        return null
    }
}

export async function saveContractGroupAbi(
    contractGroup: string,
    groupAbi: Abi,
    chainId: string = chainIds.ETHEREUM
) {
    const key = [abiRedisKeys.CONTRACT_GROUPS_PREFIX, chainId].join('-')
    try {
        const map = {
            [contractGroup]: JSON.stringify(groupAbi),
        }
        await redis?.hSet(key, map)
    } catch (err) {
        logger.error(`Error saving contract group ABI for ${contractGroup}: ${err}.`)
        return false
    }
    return true
}
