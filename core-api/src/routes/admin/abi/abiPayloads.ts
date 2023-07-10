import { ValidatedPayload, StringKeyMap } from '../../../types'
import { chainIds, supportedChainIds } from '../../../../../shared'

export interface GetAbiPayload {
    chainId: string
    address: string
}

export interface SaveAbiPayload {
    chainId: string
    address: string
    abi: StringKeyMap[]
}

export interface UpsertAbisPayload {
    addresses: string[]
    chainId?: string
    overwriteWithStarscan?: boolean
    overwriteWithSamczsun?: boolean
}

export function parseUpsertAbisPayload(data: StringKeyMap): ValidatedPayload<UpsertAbisPayload> {
    const addresses = data?.addresses
    const chainId = data?.chainId
    const overwriteWithStarscan = data?.overwriteWithStarscan || false
    const overwriteWithSamczsun = data?.overwriteWithSamczsun || false

    if (!addresses || !addresses.length) {
        return { isValid: false, error: '"addresses" missing or empty' }
    }

    if (chainId && !supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    return {
        isValid: true,
        payload: {
            addresses,
            chainId: data?.chainId || chainIds.ETHEREUM,
            overwriteWithStarscan,
            overwriteWithSamczsun,
        },
    }
}

export function parseGetAbiPayload(data: StringKeyMap): ValidatedPayload<GetAbiPayload> {
    const id = data?.id
    if (!id) {
        return { isValid: false, error: '"id" required' }
    }

    const comps = id.split(':')
    if (comps.length !== 2) {
        return { isValid: false, error: '"id" must be in <chainId>:<address> format' }
    }

    const [chainId, address] = comps
    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    return {
        isValid: true,
        payload: { chainId, address: address.toLowerCase() },
    }
}

export function parseSaveAbiPayload(data: StringKeyMap): ValidatedPayload<SaveAbiPayload> {
    const chainId = data?.chainId
    if (!chainId || !supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    const address = data?.address
    if (!address) {
        return { isValid: false, error: '"address" required' }
    }

    let abi = data?.abi
    if (!abi) {
        return { isValid: false, error: '"abi" required' }
    }

    try {
        abi = JSON.stringify(abi)
    } catch (err) {
        return { isValid: false, error: `Error stringifying abi: ${err}` }
    }

    return {
        isValid: true,
        payload: { chainId, address: address.toLowerCase(), abi },
    }
}
