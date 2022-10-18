import { app } from '../../express'
import paths from '../../../utils/paths'
import { parseUpsertAbisPayload } from './abiPayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'

/**
 * Upsert ABIs for an array of provided addresses.
 */
app.post(paths.UPSERT_ABIS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseUpsertAbisPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // TODO: Kick off delayed job...

    return res.status(codes.SUCCESS).json({ ok: true })
})