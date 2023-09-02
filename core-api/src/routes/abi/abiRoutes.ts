import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetAbiPayload } from './abiPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { getContractGroupAbi } from '../../../../shared'

/**
 * Get the ABI for a contract group.
 */
app.get(paths.ABI, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseGetAbiPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const abi = await getContractGroupAbi(payload.group)
    return res.status(codes.SUCCESS).json({ abi })
})
