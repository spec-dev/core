import { supportedChainIds } from '../../../../shared'
import config from '../../config'
import { StringKeyMap, ValidatedPayload } from '../../types'

export interface SearchLiveObjectPayloadFilters {
    chainIds?: string[]
    namespace?: string
}

export interface SearchLiveObjectPayload {
    uid: string
    query: string
    filters: SearchLiveObjectPayloadFilters
    offset: number
    limit: number
}

export interface LiveObjectPagePayload {
    uid: string
}

export function parseSearchLiveObjectPayload(data: StringKeyMap): ValidatedPayload<SearchLiveObjectPayload> {
    const uid = data?.uid
    const query = data?.query
    const filters = data?.filters || {}
    const offset = data?.offset || 0

    // Validate chain ids.
    const chainIds = (filters.chainIds || []).filter(id => !!id)
    if (chainIds.length) {
        const invalidChainIds = chainIds.filter((id) => !supportedChainIds.has(id))
        if (invalidChainIds.length) {
            return { isValid: false, error: `Invalid chain ids: ${invalidChainIds.join(', ')}` }
        }
    }

    // Validate limit.
    let limit = config.LIVE_OBJECT_SEARCH_DEFAULT_BATCH_SIZE
    if (data?.limit) {
        limit = parseInt(data.limit)
        if (isNaN(limit) || limit < 0) {
            return { isValid: false, error: `"limit" must be a non-zero integer` }
        }
    }
    limit = Math.min(limit, 1000)

    return {
        isValid: true,
        payload: { uid, query, filters, offset, limit },
    }
}

export function parseLiveObjectPagePayload(data: StringKeyMap): ValidatedPayload<LiveObjectPagePayload> {
    const uid = data?.uid

    if (!uid) {
        return { isValid: false, error: '"uid" is required' }
    }

    return {
        isValid: true,
        payload: { uid },
    }
}