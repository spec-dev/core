import { app } from '../../express'
import paths from '../../../utils/paths'
import { parseGetAbiPayload, parseSaveAbiPayload, parseUpsertAbisPayload } from './abiPayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import { enqueueDelayedJob, getAbi, saveAbis } from '../../../../../shared'

/**
 * Get an ABI by chainId:address
 */
 app.get(paths.ADMIN_ABI, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseGetAbiPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Get abi for chainId:address
    const { chainId, address } = payload
    const abi = await getAbi(address, chainId)
    
    return res.status(codes.SUCCESS).json({ abi })
})

/**
 * Save an ABI for chainId, address, abi.
 */
 app.put(paths.ADMIN_ABI, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseSaveAbiPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Save abi for chainId:address
    const { chainId, address, abi } = payload
    const abis = {}
    abis[address] = abi
    if (!(await saveAbis(abis, chainId))) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false })
    }
    
    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Upsert ABIs for an array of provided addresses.
 */
app.post(paths.ADMIN_ABIS, async (req, res) => {
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
