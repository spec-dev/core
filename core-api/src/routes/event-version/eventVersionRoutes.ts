import { app } from '../express'
import paths from '../../utils/paths'
import { parseResolveEventVersionsPayload } from './eventVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import { resolveEventVersionNames } from '../../../../shared'

/**
 * Resolve full event version names for a set of given event "inputs".
 */
app.post(paths.RESOLVE_EVENT_VERSIONS, async (req, res) => {
    if (!(await authorizeRequestWithProjectApiKey(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseResolveEventVersionsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get registered full event version names.
    const { data, error: resolveError } = await resolveEventVersionNames(payload.inputs)
    if (resolveError) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: resolveError })
    }

    return res.status(codes.SUCCESS).json(data)
})