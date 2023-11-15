import { ValidatedPayload, StringKeyMap } from '../../types'
import { couldBeEventName } from '../../../../shared'

export interface ResolveEventVersionsPayload {
    inputs: string[]
}

export interface EventVersionPayloadFilters {
    namespace?: string
}

export interface EventVersionPayload {
    filters: EventVersionPayloadFilters
}

export interface ResolveEventVersionCursorsPayload {
    givenName: string
}

export interface GetEventVersionDataAfterPayload {
    cursors: StringKeyMap
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

export function parseResolveEventVersionCursorsPayload(
    data: StringKeyMap
): ValidatedPayload<ResolveEventVersionCursorsPayload> {
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

export function parseGetEventVersionDataAfterPayload(
    data: StringKeyMap
): ValidatedPayload<GetEventVersionDataAfterPayload> {
    const cursors = data?.cursors || []

    if (!cursors.length) {
        return { isValid: false, error: '"cursors" is empty' }
    }

    for (const cursor of cursors) {
        if (!cursor.name) {
            return { isValid: false, error: 'Cursor "name" is required' }
        }
        if (!couldBeEventName(cursor.name)) {
            return { isValid: false, error: 'Invalid cursor name' }
        }
        if (!cursor.nonce) {
            return { isValid: false, error: 'Cursor "nonce" is required' }
        }
    }

    return {
        isValid: true,
        payload: {
            cursors,
        },
    }
}