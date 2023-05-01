import { app } from '../express'
import paths from '../../utils/paths'
import { parseGenerateTestInputsPayload } from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey } from '../../utils/requests'
import generateInputRangeData from '../../services/generateInputRangeData'

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