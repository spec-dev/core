import { app } from '../express'
import paths from '../../utils/paths'
import { codes, errors } from '../../utils/requests'
import searchLiveObjects from '../../services/searchLiveObjects'
import { parseLiveObjectPagePayload, parseSearchLiveObjectPayload } from './liveObjectPayloads'
import { getEventVersionsByLiveObjectVersion, getLiveObjectPageData } from '../../../../shared'

/**
 * Get the current version of all live objects.
 */
app.post(paths.LIVE_OBJECTS_SEARCH, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseSearchLiveObjectPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { uid, query, filters, offset, limit } = payload

    // Find live objects by search terms.
    const { data, error: searchError } = await searchLiveObjects(uid, query, filters, offset, limit)
    return searchError
        ? res.status(codes.INTERNAL_SERVER_ERROR).json({ error: searchError || errors.UNKNOWN_ERROR })
        : res.status(codes.SUCCESS).json(data)
})

/**
 * Get current version of live object and associated event versions by uid.
 */
app.get(paths.LIVE_OBJECT_PAGE, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseLiveObjectPagePayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    
    // Get live object version by uid.
    const pageData = await getLiveObjectPageData(payload.uid)
    if (!pageData) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }
    const [data, lov] = pageData
        
    // Get associated event versions
    const eventVersions = await getEventVersionsByLiveObjectVersion(lov.id)
    if (!eventVersions) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }
    data.inputEvents = eventVersions
    
    return res.status(codes.SUCCESS).json(data)
})
