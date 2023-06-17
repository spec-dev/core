import { app } from '../express'
import paths from '../../utils/paths'
import { parseResolveCallVersionsPayload } from './callVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import { resolveCallVersionNames } from '../../../../shared'

/**
 * Resolve full contract call version names for a set of given call "inputs".
 */
app.post(paths.RESOLVE_CALL_VERSIONS, async (req, res) => {
    if (!(await authorizeRequestWithProjectApiKey(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseResolveCallVersionsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get registered contract call version names.
    const { data, error: resolveError } = await resolveCallVersionNames(payload.inputs)
    if (resolveError) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: resolveError })
    }

    return res.status(codes.SUCCESS).json(data)
})