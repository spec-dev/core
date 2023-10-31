import { MAX_RECORD_COUNT_REQUEST } from '../../../../shared/src'
import { StringKeyMap, ValidatedPayload } from '../../types'

export interface GetNamespacePayload {
    slug: string
}

export interface NamespaceRecordCountsPayload {
    nsps: string[]
}

export function parseGetNamespacePayload(data: StringKeyMap): ValidatedPayload<GetNamespacePayload> {
    const slug = data?.slug

    if (!slug?.length) {
        return { isValid: false, error: '"slug" was missing or empty' }
    }

    return {
        isValid: true,
        payload: { slug },
    }
}

export function parseNamespaceRecordCountsPayload(data: StringKeyMap): ValidatedPayload<NamespaceRecordCountsPayload> {
    const nsps = data?.nsps || []

    if (!nsps.length) {
        return { isValid: false, error: '"nsps" was missing or empty' }
    }

    if (nsps.length > MAX_RECORD_COUNT_REQUEST) {
        return { isValid: false, error: `Request exceeds maximum limit of ${MAX_RECORD_COUNT_REQUEST} entries` }
    }

    return {
        isValid: true,
        payload: { nsps },
    }
}