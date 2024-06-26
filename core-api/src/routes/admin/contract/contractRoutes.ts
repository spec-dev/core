import { app } from '../../express'
import paths from '../../../utils/paths'
import {
    parseResetContractGroupRecordCountsPayload,
} from './contractPayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import { enqueueDelayedJob } from '../../../../../shared'

/**
 * Force reset the record counts for a contract group.
 */
app.post(paths.RESET_CONTRACT_GROUP_RECORD_COUNTS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseResetContractGroupRecordCountsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Kick off delayed job to reset record counts.
    const scheduled = await enqueueDelayedJob('resetContractGroupEventRecordCounts', payload)
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Force reset the start block numbers for all events in a contract group.
 */
 app.post(paths.RESET_CONTRACT_GROUP_EVENT_START_BLOCKS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseResetContractGroupRecordCountsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Kick off delayed job to reset record counts.
    const scheduled = await enqueueDelayedJob('resetEventStartBlocks', payload)
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})