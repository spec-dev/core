import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetLiveObjectVersionPublishJobPayload } from './liveObjectVersionPublishJobPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { getPublishAndDeployLiveObjectVersionJob } from '../../../../shared'

/**
 * Get a contract registration job by uid.
 */
app.get(paths.LIVE_OBJECT_PUBLISH_JOB, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid } = parseGetLiveObjectVersionPublishJobPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Find & return publish live object version job by uid.
    const liveObjectVersionPublishJob = await getPublishAndDeployLiveObjectVersionJob(payload.uid)
    const data = liveObjectVersionPublishJob ? liveObjectVersionPublishJob.view() : {}
    return res.status(codes.SUCCESS).json(data)
})
