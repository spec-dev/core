import { ValidatedPayload, StringKeyMap } from '../../types'

export interface ResolveEventVersionsPayload {
    inputs: string[]
}

export interface EventVersionPayloadFilters {
    namespace?: string
}

export interface EventVersionPayload {
    filters: EventVersionPayloadFilters
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

export function parseEventVersionsPayload(
    data: StringKeyMap
): ValidatedPayload<EventVersionPayload> {
    const filters = data?.filters || {}

    return {
        isValid: true,
        payload: { filters, },
    }
}