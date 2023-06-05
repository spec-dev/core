import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetAbiPayload } from './abiPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { enqueueDelayedJob, getAbi, saveAbis } from '../../../../shared'

/**
 * Get an ABI by chainId:address
 */
 app.get(paths.ABI, async (req, res) => {
     const user = await authorizeRequest(req, res)
     if (!user) return
     
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
