import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetPublishLiveObjectVersionJobPayload } from './publishLiveObjectVersionJobPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { getPublishAndDeployLiveObjectVersionJob } from '../../../../shared'

/**
 * Get a publish live object version job by uid.
 */
app.get(paths.PUBLISH_LIVE_OBJECT_VERSION_JOB, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid } = parseGetPublishLiveObjectVersionJobPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Find & return publish live object version job by uid.
    const publishLiveObjectVersionJob = await getPublishAndDeployLiveObjectVersionJob(payload.uid)
    const data = publishLiveObjectVersionJob ? publishLiveObjectVersionJob.view() : {}
    return res.status(codes.SUCCESS).json(data)
})
