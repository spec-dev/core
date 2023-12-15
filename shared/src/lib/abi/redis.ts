import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { Abi, AbiItem } from './types'
import { StringMap, StringKeyMap } from '../types'
import { specEnvs } from '../utils/env'
import chainIds from '../utils/chainIds'
import { sleep } from '../utils/time'

// Create redis client.
const configureRedis = config.ENV === specEnvs.LOCAL || config.ABI_REDIS_HOST !== 'localhost'
export const redis = configureRedis ? createClient({ url: config.ABI_REDIS_URL }) : null

// Log any redis client errors and attempt reconnections.
let reconnectAttempt = 0
redis?.on('error', async (err) => {
    console.error(err)
    logger.error(`ABI Redis error: ${err}`)

    if (reconnectAttempt >= 3) return
    reconnectAttempt++
    logger.error(`ABI Redis - attempting reconnect ${reconnectAttempt}`)

    try {
        await redis?.disconnect()
        await sleep(1000)
        await redis?.connect()
    } catch (err) {
        console.error(err)
        logger.error(`ABI Redis -- reconnect error: ${err}`)
    }
})

export const abiRedisKeys = {
    ETH_CONTRACTS: 'eth-contracts',
    ETH_FUNCTION_SIGNATURES: 'eth-function-signatures',
    GOERLI_CONTRACTS: 'goerli-contracts',
    GOERLI_FUNCTION_SIGNATURES: 'goerli-function-signatures',
    POLYGON_CONTRACTS: 'polygon-contracts',
    POLYGON_FUNCTION_SIGNATURES: 'polygon-function-signatures',
    MUMBAI_CONTRACTS: 'mumbai-contracts',
    MUMBAI_FUNCTION_SIGNATURES: 'mumbai-function-signatures',
    BASE_CONTRACTS: 'base-contracts',
    BASE_FUNCTION_SIGNATURES: 'base-function-signatures',
    OPTIMISM_CONTRACTS: 'optimism-contracts',
    OPTIMISM_FUNCTION_SIGNATURES: 'optimism-function-signatures',
    ARBITRUM_CONTRACTS: 'arbitrum-contracts',
    ARBITRUM_FUNCTION_SIGNATURES: 'arbitrum-function-signatures',
    ARBITRUM_SEPOLIA_CONTRACTS: 'arbitrum-sepolia-contracts',
    ARBITRUM_SEPOLIA_FUNCTION_SIGNATURES: 'arbitrum-sepolia-function-signatures',
    PGN_CONTRACTS: 'pgn-contracts',
    PGN_FUNCTION_SIGNATURES: 'pgn-function-signatures',
    CELO_CONTRACTS: 'celo-contracts',
    CELO_FUNCTION_SIGNATURES: 'celo-function-signatures',
    LINEA_CONTRACTS: 'linea-contracts',
    LINEA_FUNCTION_SIGNATURES: 'linea-function-signatures',
    SEPOLIA_CONTRACTS: 'sepolia-contracts',
    SEPOLIA_FUNCTION_SIGNATURES: 'sepolia-function-signatures',
    CONTRACT_GROUPS: 'contract-groups',
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
        case chainIds.BASE:
            return abiRedisKeys.BASE_CONTRACTS
        case chainIds.OPTIMISM:
            return abiRedisKeys.OPTIMISM_CONTRACTS
        case chainIds.ARBITRUM:
            return abiRedisKeys.ARBITRUM_CONTRACTS
        case chainIds.ARBITRUM_SEPOLIA:
            return abiRedisKeys.ARBITRUM_SEPOLIA_CONTRACTS
        case chainIds.PGN:
            return abiRedisKeys.PGN_CONTRACTS
        case chainIds.CELO:
            return abiRedisKeys.CELO_CONTRACTS
        case chainIds.LINEA:
            return abiRedisKeys.LINEA_CONTRACTS
        case chainIds.SEPOLIA:
            return abiRedisKeys.SEPOLIA_CONTRACTS
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
        case chainIds.BASE:
            return abiRedisKeys.BASE_FUNCTION_SIGNATURES
        case chainIds.OPTIMISM:
            return abiRedisKeys.OPTIMISM_FUNCTION_SIGNATURES
        case chainIds.ARBITRUM:
            return abiRedisKeys.ARBITRUM_FUNCTION_SIGNATURES
        case chainIds.ARBITRUM_SEPOLIA:
            return abiRedisKeys.ARBITRUM_SEPOLIA_FUNCTION_SIGNATURES
        case chainIds.PGN:
            return abiRedisKeys.PGN_FUNCTION_SIGNATURES
        case chainIds.CELO:
            return abiRedisKeys.CELO_FUNCTION_SIGNATURES
        case chainIds.LINEA:
            return abiRedisKeys.LINEA_FUNCTION_SIGNATURES
        case chainIds.SEPOLIA:
            return abiRedisKeys.SEPOLIA_FUNCTION_SIGNATURES
        default:
            return null
    }
}

function stringify(abi: any): string | null {
    if (!abi) return null
    let abiStr
    try {
        abiStr = JSON.stringify(abi)
    } catch (err) {
        logger.error(`Error stringifying abi for: ${abi} - ${err}`)
        return null
    }
    return abiStr
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

export async function saveAbisMap(abisMap: StringKeyMap, chainId: string): Promise<boolean> {
    const stringified: StringMap = {}
    for (const address in abisMap) {
        const abi = abisMap[address]
        const abiStr = stringify(abi)
        if (!abiStr) continue
        stringified[address] = abiStr
    }
    if (!Object.keys(stringified).length) return true
    return await saveAbis(stringified, chainId)
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

export async function getContractGroupAbi(contractGroup: string): Promise<Abi | null> {
    try {
        const abiStr = (await redis?.hGet(abiRedisKeys.CONTRACT_GROUPS, contractGroup)) || null
        return abiStr ? (JSON.parse(abiStr) as Abi) : []
    } catch (err) {
        logger.error(`Error getting contract group ABI for ${contractGroup}: ${err}.`)
        return null
    }
}

export async function getContractGroupAbis(
    contractGroups: string[]
): Promise<{ [key: string]: Abi } | null> {
    if (!contractGroups?.length) return {}
    try {
        const results = (await redis?.hmGet(abiRedisKeys.CONTRACT_GROUPS, contractGroups)) || []
        const abis = {}
        for (let i = 0; i < contractGroups.length; i++) {
            const group = contractGroups[i]
            const abiStr = results[i]
            if (!abiStr) continue
            const abi = JSON.parse(abiStr) as Abi
            abis[group] = abi
        }
        return abis
    } catch (err) {
        logger.error(`Error getting ABIs for contract groups ${contractGroups.join(', ')}: ${err}.`)
        return null
    }
}

export async function saveContractGroupAbi(contractGroup: string, groupAbi: Abi) {
    try {
        const map = {
            [contractGroup]: JSON.stringify(groupAbi),
        }
        await redis?.hSet(abiRedisKeys.CONTRACT_GROUPS, map)
    } catch (err) {
        logger.error(`Error saving contract group ABI for ${contractGroup}: ${err}.`)
        return false
    }
    return true
}
