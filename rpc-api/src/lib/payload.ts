import { ValidatedPayload, StringKeyMap } from './types'
import { AbiItem, AbiItemType, isValidAddress, supportedChainIds, supportedMetaProtocolIds, parseMetaPointer } from '../../../shared'
import { abiItemFromHumanReadableString } from '../utils/formatters'

export interface CallPayload {
    chainId: string
    contractAddress: string
    abiItem: AbiItem
    inputs: any[]
}

export interface MetadataPayload {
    protocolId: string
    pointer: string
}

export function parseCallPayload(data: StringKeyMap): ValidatedPayload<CallPayload> {
    const chainId = data?.chainId?.toString()
    const contractAddress = data?.contractAddress
    let abiItem = data?.abiItem
    const inputs = data?.inputs || []

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (!contractAddress) {
        return { isValid: false, error: '"contractAddress" required' }
    }
    
    if (!isValidAddress(contractAddress)) {
        return { isValid: false, error: `Invalid "contractAddress": ${contractAddress}`}
    }

    if (!abiItem) {
        return { isValid: false, error: '"abiItem" required' }
    }

    if (typeof abiItem === 'string') {
        abiItem = abiItemFromHumanReadableString(abiItem)
        if (!abiItem) {
            return { isValid: false, error: `Invalid "abiItem" ${abiItem}` }
        }    
    }

    if (typeof abiItem === 'object' && Array.isArray(abiItem)) {
        if (abiItem.length > 1) {
            return { isValid: false, error: `Invalid "abiItem" ${abiItem}` }
        }
        abiItem = abiItem[0]
    }

    const isObject = !!abiItem && typeof abiItem === 'object' && !Array.isArray(abiItem)
    if (!isObject || abiItem.type !== AbiItemType.Function) {
        return { isValid: false, error: `Invalid "abiItem" ${abiItem}` }
    }

    return {
        isValid: true,
        payload: { chainId, contractAddress, abiItem, inputs },
    }
}

export function parseMetadataPayload(data: StringKeyMap): ValidatedPayload<MetadataPayload> {
    const protocolId = data?.protocolId?.toString()
    let pointer = data?.pointer

    if (!supportedMetaProtocolIds.has(protocolId)) {
        return { isValid: false, error: `Invalid "protocolId": ${protocolId}` }
    }

    if (!pointer) {
        return { isValid: false, error: '"pointer" required' }
    }

    pointer = parseMetaPointer(pointer, protocolId)
    if (!pointer) {
        return { isValid: false, error: `Invalid "pointer" for protocolId=${protocolId}: ${pointer}`}
    }

    return {
        isValid: true,
        payload: { protocolId, pointer },
    }
}