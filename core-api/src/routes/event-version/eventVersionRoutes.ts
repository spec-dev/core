import { app } from '../express'
import paths from '../../utils/paths'
import { 
    parseEventVersionsPayload, 
    parseResolveEventVersionsPayload, 
    parseResolveEventVersionCursorsPayload, 
    parseGetEventVersionDataAfterPayload } 
from './eventVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import { 
    buildIconUrl, 
    chainIdForContractNamespace, 
    getEventVersions, 
    isContractNamespace, 
    resolveEventVersionNames,
    resolveEventVersionCursors,
    getPublishedEventsAfterEventCursors
} from '../../../../shared'

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

/**
 * Get all event versions.
 */
app.post(paths.EVENT_VERSIONS, async (req, res) => {
    const { payload, isValid, error } = parseEventVersionsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const { filters } = payload
    const eventVersions = await getEventVersions(filters)
    if (!eventVersions) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    const formattedEventVersions = []

    eventVersions.forEach(version => {
        const chainIds = [chainIdForContractNamespace(version.event.namespace.slug)]
        const isContractEvent = isContractNamespace(version.event.namespace.name)
        const icon = (isContractEvent 
            ? buildIconUrl(version.event.namespace.name.split('.')[2])
            : buildIconUrl(version.event.namespace.name)) 
            || null   
        formattedEventVersions.push({...version, chainIds: chainIds, icon: icon})
    })

    return res.status(codes.SUCCESS).json(formattedEventVersions)
})

/**
 * Resolve the full event version names for a set of given event names, 
 * including their most recent cursors and event entry among them.
 */
app.post(paths.RESOLVE_EVENT_VERSION_CURSORS, async (req, res) => {
    const { payload, isValid, error } = parseResolveEventVersionCursorsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    let data = {}
    try {
        data = await resolveEventVersionCursors(payload.givenName)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err })
    }

    return res.status(codes.SUCCESS).json(data)
})

/**
 * Get any missed event version entries from the given cursors.
 */
 app.post(paths.GET_EVENT_VERSION_DATA_AFTER, async (req, res) => {
    const { payload, isValid, error } = parseGetEventVersionDataAfterPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    let events = {}
    try {
        events = await getPublishedEventsAfterEventCursors(payload.cursors as any)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err })
    }

    return res.status(codes.SUCCESS).json({ events })
})