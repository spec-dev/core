import { ValidatedPayload, StringKeyMap } from '../../../types'

export interface UpsertAbisPayload {
    addresses: string[]
}

export function parseUpsertAbisPayload(data: StringKeyMap): ValidatedPayload<UpsertAbisPayload> {
    const addresses = data?.addresses
    if (!addresses || !addresses.length) {
        return { isValid: false, error: '"addresses" missing or empty' }
    }

    return { 
        isValid: true,
        payload: { addresses },
    }
}