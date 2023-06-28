import { app } from '../../express'
import paths from '../../../utils/paths'
import {
    parsePublishLiveObjectVersionPayload,
    parseIndexLiveObjectVersionsPayload,
} from './liveObjectVersionPayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import {
    enqueueDelayedJob,
    getNamespace,
    getLiveObject,
    getLatestLiveObjectVersion,
    isVersionGt,
} from '../../../../../shared'

/**
 * Publish a new live object version.
 */
app.post(paths.PUBLISH_LIVE_OBJECT_VERSION, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parsePublishLiveObjectVersionPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get namespace to publish live object version under.
    const namespace = await getNamespace(payload.namespace)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // Ensure namespace has a remote git repository assigned to it already.
    if (!namespace.codeUrl) {
        return res
            .status(codes.INTERNAL_SERVER_ERROR)
            .json({ error: errors.NAMESPACE_MISSING_CODE_URL })
    }

    // Ensure the version to publish is greater than the existing version.
    const liveObject = await getLiveObject(namespace.id, payload.name)
    const latestLiveObjectVersion = liveObject && (await getLatestLiveObjectVersion(liveObject.id))
    if (latestLiveObjectVersion && !isVersionGt(payload.version, latestLiveObjectVersion.version)) {
        return res.status(codes.NOT_FOUND).json({ error: errors.VERSION_ALREADY_PUBLISHED })
    }

    // Kick off delayed job to publish live object version.
    const scheduled = await enqueueDelayedJob('publishLiveObjectVersion', {
        namespace: {
            id: namespace.id,
            name: namespace.name,
            codeUrl: namespace.codeUrl,
        },
        liveObjectId: liveObject?.id || null,
        payload,
    })
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Index live object versions.
 */
app.post(paths.INDEX_LIVE_OBJECT_VERSIONS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseIndexLiveObjectVersionsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Kick off delayed job to index live object versions.
    const scheduled = await enqueueDelayedJob('indexLiveObjectVersions', payload)
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})
