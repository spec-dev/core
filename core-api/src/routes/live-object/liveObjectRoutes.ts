import { app } from '../express'
import paths from '../../utils/paths'
import { codes, errors } from '../../utils/requests'
import searchLiveObjects from '../../services/searchLiveObjects'
import { parseSearchLiveObjectPayload } from './liveObjectPayloads'

/**
 * Get the current version of all live objects.
 */
app.get(paths.LIVE_OBJECTS_SEARCH, async (req, res) => {

    // Parse & validate payload.
    const { payload, isValid, error } = parseSearchLiveObjectPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { query, filter, offset, limit } = payload

    // Find live objects by search terms.
    const { data, error: searchError } = await searchLiveObjects(query, filter, offset, limit)
    return searchError
        ? res.status(codes.INTERNAL_SERVER_ERROR).json({ error: searchError || errors.UNKNOWN_ERROR })
        : res.status(codes.SUCCESS).json(data)
})