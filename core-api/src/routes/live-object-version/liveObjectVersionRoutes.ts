import { app } from '../express'
import paths from '../../utils/paths'
import { parseGenerateTestInputsPayload, parseLatestLovRecordsPayload } from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import generateInputRangeData from '../../services/generateInputRangeData'
import getLatestLiveObjectVersionRecords from '../../services/getLatestLiveObjectVersionRecords'
import { getLiveObjectVersion } from '../../../../shared'

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

    // Find LiveObjectVersion by uid.
    const { id: uid, cursor } = payload
    const liveObjectVersion = await getLiveObjectVersion(uid)
    if (!liveObjectVersion) {
        return res.status(codes.NOT_FOUND).json({ error: errors.LOV_NOT_FOUND })
    }

    // Get the latest LOV records after the given cursor (if any).
    const { data, error: serviceError } = await getLatestLiveObjectVersionRecords(liveObjectVersion, cursor)
    if (serviceError) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: serviceError })
    }

    return res.status(codes.SUCCESS).json(data)
})