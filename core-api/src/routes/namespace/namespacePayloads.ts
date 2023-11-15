import coreApiConfig from '../../config'
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

    if (nsps.length > coreApiConfig.MAX_RECORD_COUNT_BATCH_SIZE) {
        return { 
            isValid: false, 
            error: `Request exceeds maximum limit of ${coreApiConfig.MAX_RECORD_COUNT_BATCH_SIZE} entries` 
        }
    }

    return {
        isValid: true,
        payload: { nsps },
    }
}