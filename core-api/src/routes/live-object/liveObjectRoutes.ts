import { app } from '../express'
import paths from '../../utils/paths'
import { codes, errors } from '../../utils/requests'
import searchLiveObjects from '../../services/searchLiveObjects'

/**
 * Get the current version of all live objects.
 */
app.get(paths.LIVE_OBJECTS, async (req, res) => {
    const { data, error } = await searchLiveObjects()
    return error
        ? res.status(codes.INTERNAL_SERVER_ERROR).json({ error: error || errors.UNKNOWN_ERROR })
        : res.status(codes.SUCCESS).json(data)
})