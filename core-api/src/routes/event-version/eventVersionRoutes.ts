import { app } from '../express'
import paths from '../../utils/paths'
import { parseResolveEventVersionsPayload, parseSampleEventVersionPayload } from './eventVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import { resolveEventVersionNames, resolveSampleEventVersion, resolveSampleContractEventVersion } from '../../../../shared'

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

app.get(paths.EVENT_SAMPLE, async (req, res) => {
    const { payload, isValid, error } = parseSampleEventVersionPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    let event = null

    // check if givenName is a contract event or LiveObject event
    if (payload.givenName.split('@')[0].split('.').length === 2) {
        event = await resolveSampleEventVersion(payload.givenName)
    } else {
        event = await resolveSampleContractEventVersion(payload.givenName)
    }

    return res.status(codes.SUCCESS).json({ event })
})