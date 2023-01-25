import { app } from '../../express'
import paths from '../../../utils/paths'
import { parseUpsertAbisPayload } from './abiPayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import { enqueueDelayedJob } from '../../../../../shared'

/**
 * Upsert ABIs for an array of provided addresses.
 */
app.post(paths.UPSERT_ABIS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseUpsertAbisPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Kick off delayed job to upsert abis.
    if (!(await enqueueDelayedJob('upsertAbis', payload))) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})