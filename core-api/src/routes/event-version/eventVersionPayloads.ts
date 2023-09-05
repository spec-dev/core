import { ValidatedPayload, StringKeyMap } from '../../types'
import { couldBeEventName } from '../../../../shared'

export interface ResolveEventVersionsPayload {
    inputs: string[]
}

export interface ResolveEventVersionCursorsPayload {
    givenName: string
}

export interface GetEventVersionDataAfterPayload {
    cursors: StringKeyMap
}

export interface SearchEventVersionPayload {
    name: string
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

export function parseSearchEventVersionPayload(data: StringKeyMap): ValidatedPayload<SearchEventVersionPayload> {
    const name = data?.name || null

    return {
        isValid: true,
        payload: { name, },
    }
}