import { StringKeyMap, ValidatedPayload } from '../../types'

export interface EventPayloadFilters {
    namespace?: string
}

export interface EventPayload {
    filters: EventPayloadFilters
}

export function parseEventsPayload(
    data: StringKeyMap
): ValidatedPayload<EventPayload> {
    const filters = data?.filters || {}

    return {
        isValid: true,
        payload: { filters, },
    }
}