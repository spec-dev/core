import { ValidatedPayload, StringKeyMap } from '../../types'
import { couldBeEventName } from '../../../../shared'

export interface ResolveEventVersionsPayload {
    inputs: string[]
}

export interface ResolveSampleEventVersionsPayload {
    givenName: string
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

export function parseSampleEventVersionPayload(
    data: StringKeyMap
): ValidatedPayload<ResolveSampleEventVersionsPayload> {
    const givenName = data?.givenName

    if (!givenName) {
        return { isValid: false, error: '"givenName" required' }
    }

    if (!couldBeEventName(givenName)) {
        return { isValid: false, error: 'Invalid "givenName" event name' }
    }

    return {
        isValid: true,
        payload: {
            givenName,
        },
    }
}
