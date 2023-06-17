import config from '../../config'
import { StringKeyMap, ValidatedPayload } from '../../types'

export interface SearchLiveObjectPayload {
    query: string
    filter: string
    offset: number
    limit: number
}

export function parseSearchLiveObjectPayload(data: StringKeyMap): ValidatedPayload<SearchLiveObjectPayload> {

    const query = data?.query
    const filter = data?.filter
    const offset = data?.offset || 0
    let limit = data?.limit && data.limit <= 1000 ? data.limit : config.LIVE_OBJECT_SEARCH_DEFAULT_BATCH_SIZE

    return {
        isValid: true,
        payload: { query, filter, offset, limit },
    }
}