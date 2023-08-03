import { app } from '../express'
import paths from '../../utils/paths'
import { parseGenerateTestInputsPayload, parsePublishLiveObjectVersionPayload } from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey, authorizeRequestForNamespace, authorizeRequest } from '../../utils/requests'
import { enqueueDelayedJob, getNamespace, NamespaceAccessTokenScope } from '../../../../shared'
import generateInputRangeData from '../../services/generateInputRangeData'
import { userHasNamespacePermissions } from '../../utils/auth'

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

app.post(paths.PUBLISH_LIVE_OBJECT_VERSION, async (req, res) => {
    // if (!(await authorizeRequestWithProjectApiKey(req, res))) return // should i be using the api key insteadd of session token?
    const user = await authorizeRequest(req, res)
    if (!user) return

    const { payload, isValid, error } = parsePublishLiveObjectVersionPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // try {
    //     const { canAccess } = await userHasNamespacePermissions(user.id, payload.nsp)
    //     if (!canAccess) {
    //         res.status(codes.FORBIDDEN).json({ error: errors.FORBIDDEN })
    //         return false
    //     }
    // } catch (error) {
    //     res.status(codes.FORBIDDEN).json({ error: errors.FORBIDDEN })
    //     return 
    // }

    // Kick off delayed job to something.
    const scheduled = await enqueueDelayedJob('publishAndDeployLiveObjectVersion', payload)
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }
    return res.status(codes.SUCCESS).json({ ok: true })
})