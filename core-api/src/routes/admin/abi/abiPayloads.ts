import { ValidatedPayload, StringKeyMap } from '../../../types'
import { chainIds, supportedChainIds } from '../../../../../shared'

export interface UpsertAbisPayload {
    addresses: string[]
    chainId?: string
}

export function parseUpsertAbisPayload(data: StringKeyMap): ValidatedPayload<UpsertAbisPayload> {
    const addresses = data?.addresses
    const chainId = data?.chainId

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
        },
    }
}