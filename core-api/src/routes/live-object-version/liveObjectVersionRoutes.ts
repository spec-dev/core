import { app } from '../express'
import paths from '../../utils/paths'
import { 
    parseGenerateTestInputsPayload, 
    parseLatestLovRecordsPayload, 
    parseGetLiveObjectVersionPayload, 
    parseLovRecordCountsPayload 
} from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import generateInputRangeData from '../../services/generateInputRangeData'
import getLatestLiveObjectVersionRecords from '../../services/getLatestLiveObjectVersionRecords'
import { 
    getLiveObjectByUid, 
    getLatestLiveObjectVersion, 
    resolveLovWithPartialId, 
    getTablePathsForLiveObjectVersions, 
    getCachedRecordCounts 
} from '../../../../shared'

/**
 * Generate test input data (events and calls) for a live object version.
 */
app.post(paths.GENERATE_LOV_TEST_INPUT_DATA, async (req, res) => {
    if (!(await authorizeRequestWithProjectApiKey(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseGenerateTestInputsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Generate inputs.
    const { data, error: genError } = await generateInputRangeData(payload)
    if (genError) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: genError })
    }

    return res.status(codes.SUCCESS).json(data)
})

/**
 * Fetch the latest records for a live object version.
 */
 app.post(paths.LATEST_LOV_RECORDS, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseLatestLovRecordsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { id: liveObjectUid, cursor } = payload

    // TODO: Consolidate this into a single query.
    const liveObject = await getLiveObjectByUid(liveObjectUid)
    if (!liveObject) {
        return res.status(codes.NOT_FOUND).json({ error: errors.LIVE_OBJECT_NOT_FOUND })
    }
    const liveObjectVersion = await getLatestLiveObjectVersion(liveObject.id)
    if (!liveObjectVersion) {
        return res.status(codes.NOT_FOUND).json({ error: errors.LIVE_OBJECT_VERSION_NOT_FOUND })
    }

    // Get the latest LOV records after the given cursor (if any).
    const { data, error: serviceError } = await getLatestLiveObjectVersionRecords(liveObjectVersion, cursor)
    if (serviceError) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: serviceError })
    }

    return res.status(codes.SUCCESS).json(data)
})

/**
 * Get a live object version by "id" (some potential id or partial id).
 */
 app.get(paths.LIVE_OBJECT_VERSION, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseGetLiveObjectVersionPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Try to resolve live object version by the "id" given.
    const lov = await resolveLovWithPartialId(payload.id)
    if (!lov) {
        return res.status(codes.NOT_FOUND).json({ error: errors.LIVE_OBJECT_VERSION_NOT_FOUND })
    }

    return res.status(codes.SUCCESS).json(lov.publicView())
})

/**
 * Get record counts for live object versions.
 */
app.post(paths.LOV_RECORD_COUNTS, async (req, res) => {
    const { payload, isValid, error } = parseLovRecordCountsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const { ids } = payload 

    // Get table paths for live object versions.
    const tablePaths = await getTablePathsForLiveObjectVersions(ids)
    if (!tablePaths.length) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    // Map cached record counts to table paths.
    const recordCountsByPath = tablePaths.length ? await getCachedRecordCounts(tablePaths) : []

    // Map record counts to live object version ids.
    const recordCountsById = {}
    for (let i = 0; i < tablePaths.length; i++) {
        const tablePath = tablePaths[i]
        const id = ids[i]
        recordCountsById[id] = recordCountsByPath[tablePath] || {}
    }

    return res.status(codes.SUCCESS).json(recordCountsById)
})
