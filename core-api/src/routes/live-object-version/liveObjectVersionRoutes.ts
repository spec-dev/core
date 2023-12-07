import { app } from '../express'
import paths from '../../utils/paths'
import { 
    parseGenerateTestInputsPayload, 
    parseLatestLovRecordsPayload, 
    parseGetLiveObjectVersionPayload, 
    parseLovRecordCountsPayload,
    parsePublishLiveObjectVersionPayload,
} from './liveObjectVersionPayloads'
import { codes, errors, authorizeRequestWithProjectApiKey, authorizeRequest } from '../../utils/requests'
import generateInputRangeData from '../../services/generateInputRangeData'
import getLatestLiveObjectVersionRecords from '../../services/getLatestLiveObjectVersionRecords'
import { 
    getLiveObjectVersion, 
    getLatestLiveObjectVersion, 
    resolveLovWithPartialId, 
    getTablePathsForLiveObjectVersions, 
    getCachedRecordCounts,
    enqueueDelayedJob,
    toNamespacedVersion,
    getLiveObjectVersionsByNamespacedVersions,
    getLiveObject,
    isVersionGt,
} from '../../../../shared'
import { userHasNamespacePermissions } from '../../utils/auth'
import uuid4 from 'uuid4'

/**
 * Generate test input data (events and calls) for a live object version.
 */
app.post(paths.GENERATE_LOV_TEST_INPUT_DATA, async (req, res) => {
    // if (!(await authorizeRequestWithProjectApiKey(req, res))) return

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

    const liveObjectVersion = await getLiveObjectVersion(payload.id)
    if (!liveObjectVersion) {
        return res.status(codes.NOT_FOUND).json({ error: errors.LIVE_OBJECT_VERSION_NOT_FOUND })
    }

    // Get the latest LOV records after the given cursor (if any).
    const { data, error: serviceError } = await getLatestLiveObjectVersionRecords(liveObjectVersion, payload.cursor)
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

/**
 * Publish a new live object version.
 */
app.post(paths.PUBLISH_LIVE_OBJECT_VERSION, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parsePublishLiveObjectVersionPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Ensure user can access this namespace.
    const { canAccess, namespaceUser } = await userHasNamespacePermissions(user.id, payload.nsp)
    if (!canAccess) {
        return res.status(codes.FORBIDDEN).json({ error: errors.FORBIDDEN })
    }

    // Make sure version doesn't already exist.
    const { nsp, name, version } = payload
    const lovs = await getLiveObjectVersionsByNamespacedVersions([toNamespacedVersion(nsp, name, version)])
    if (lovs.length) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: `Version ${version} already exists` })
    }

    // Ensure the version to publish is greater than the existing version.
    const liveObject = await getLiveObject(namespaceUser.namespace.id, name)
    const latestLiveObjectVersion = liveObject && (await getLatestLiveObjectVersion(liveObject.id))
    if (latestLiveObjectVersion && !isVersionGt(version, latestLiveObjectVersion.version)) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.VERSIONS_MUST_INCREASE })
    }

    // Create a uid ahead of time that will be used as the uid for a new PublishLiveObjectVersionJob
    // that will get created inside of the publishAndDeployLiveObjectVersion delayed job. We're creating
    // this uid now so that we can return it to the caller and they can poll for the job status.
    const uid = uuid4()
    const scheduled = await enqueueDelayedJob('publishAndDeployLiveObjectVersion', {
        uid,
        ...payload
    })
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }
    return res.status(codes.SUCCESS).json({ uid })
})