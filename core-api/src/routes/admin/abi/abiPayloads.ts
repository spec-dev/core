import { ValidatedPayload, StringKeyMap } from '../../../types'
import { chainIds, supportedChainIds } from '../../../../../shared'

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
