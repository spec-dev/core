import { app } from '../express'
import paths from '../../utils/paths'
import { parseGenerateTestInputsPayload, parseLatestLovRecordsPayload, parseGetLiveObjectVersionPayload } from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import generateInputRangeData from '../../services/generateInputRangeData'
import getLatestLiveObjectVersionRecords from '../../services/getLatestLiveObjectVersionRecords'
import { getLiveObjectByUid, getLatestLiveObjectVersion, resolveLovWithPartialId } from '../../../../shared'

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
 * Generate test input data (events and calls) for a live object version.
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
