import { ValidatedPayload, StringKeyMap } from '../../types'

export interface ResolveCallVersionsPayload {
    inputs: string[]
}

export function parseResolveCallVersionsPayload(
    data: StringKeyMap
): ValidatedPayload<ResolveCallVersionsPayload> {
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
