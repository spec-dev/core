import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetAbiPayload } from './abiPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { getContractGroupAbi } from '../../../../shared'

/**
 * Get the ABI for a contract group on a specific chain.
 */
 app.get(paths.ABI, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseGetAbiPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const { chainId, group } = payload
    const abi = await getContractGroupAbi(
        group,
        chainId
    )
    return res.status(codes.SUCCESS).json({ abi })
})
