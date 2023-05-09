import { app } from '../../express'
import paths from '../../../utils/paths'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import { 
    parseToggleProcessJobsPayload, 
    parseGetProcessJobsStatusPayload, 
    parseChainIdPayload, 
    parseChainIdBlockNumberPayload, 
    parseLovIdPayload 
} from './pipelinePayloads'
import {
    setProcessJobs, 
    getProcessJobs,
    getBlockEventsSeriesNumber, 
    setBlockEventsSeriesNumber, 
    getBlockOpsCeiling, 
    freezeBlockOperationsAtOrAbove, 
    getLovFailure, 
    markLovFailure,
    removeLovFailure,
} from '../../../../../shared'

/**
 * Toggle one of the switches that controls whether 
 * a specific job in our data pipeline gets processed.
 */
app.put(paths.TOGGLE_PROCESS_JOBS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseToggleProcessJobsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Toggle process-jobs switch.
    const { chainId, key, value } = payload
    let success = false
    try {
        success = await setProcessJobs(chainId, key, value)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ ok: success })
})

/**
 * Get the current job processing status for a particular job in the data pipeline.
 */
app.post(paths.GET_PROCESS_JOBS_STATUS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseGetProcessJobsStatusPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get status.
    const { chainId, key } = payload
    let value
    try {
        value = await getProcessJobs(chainId, key)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ value })
})

/**
 * Get the current series number for a chain.
 */
app.get(paths.SERIES_NUMBER, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseChainIdPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get series number.
    let value
    try {
        value = await getBlockEventsSeriesNumber(payload.chainId)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ value })
})

/**
 * Set the current series number for a chain.
 */
app.put(paths.SERIES_NUMBER, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseChainIdBlockNumberPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get series number.
    try {
        const { chainId, blockNumber } = payload
        await setBlockEventsSeriesNumber(chainId, blockNumber)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Get the current block ops ceiling for a chain.
 */
app.get(paths.BLOCK_OPS_CEILING, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseChainIdPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get ceiling.
    let value
    try {
        value = await getBlockOpsCeiling(payload.chainId)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ value })
})

/**
 * Set the current block ops ceiling for a chain.
 */
app.put(paths.BLOCK_OPS_CEILING, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseChainIdBlockNumberPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Set ceiling.
    try {
        const { chainId, blockNumber } = payload
        await freezeBlockOperationsAtOrAbove(chainId, blockNumber)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Get the block timestamp associated with the latest failure of a live object version.
 */
 app.get(paths.LOV_FAILURE, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseLovIdPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get timestamp of failure.
    let timestamp
    try {
        timestamp = await getLovFailure(payload.lovId)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ timestamp })
})

/**
 * Delete a live object version's latest failure.
 */
 app.delete(paths.LOV_FAILURE, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseLovIdPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get timestamp of failure.
    try {
        await removeLovFailure(payload.lovId)
    } catch (err) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: err.toString() })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})