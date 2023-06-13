import { ValidatedPayload, StringKeyMap } from '../../types'

export interface ResolveEventVersionsPayload {
    inputs: string[]
}

export function parseResolveEventVersionsPayload(
    data: StringKeyMap
): ValidatedPayload<ResolveEventVersionsPayload> {
    const inputs = data?.inputs || []

    if (!inputs.length) {
        return { isValid: false, error: '"inputs" missing or empty' }
    }

    return {
        isValid: true,
        payload: {
            inputs,
        },
    }
}