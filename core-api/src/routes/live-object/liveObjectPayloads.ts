import { supportedChainIds } from '../../../../shared'
import config from '../../config'
import { StringKeyMap, ValidatedPayload } from '../../types'

export interface SearchLiveObjectPayloadFilters {
    chainIds?: string[]
}

export interface SearchLiveObjectPayload {
    query: string
    filters: SearchLiveObjectPayloadFilters
    offset: number
    limit: number
}

export function parseSearchLiveObjectPayload(data: StringKeyMap): ValidatedPayload<SearchLiveObjectPayload> {
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
        payload: { query, filters, offset, limit },
    }
}