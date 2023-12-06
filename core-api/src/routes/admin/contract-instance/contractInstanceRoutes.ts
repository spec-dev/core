import { app } from '../../express'
import paths from '../../../utils/paths'
import {
    parseNewContractInstancesPayload,
    parseDecodeContractInteractionsPayload,
} from './contractInstancePayloads'
import { codes, errors, authorizeAdminRequest } from '../../../utils/requests'
import { enqueueDelayedJob, getNamespace } from '../../../../../shared'

/**
 * Register new contract instances with Spec.
 */
app.post(paths.NEW_CONTRACT_INSTANCES, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseNewContractInstancesPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find namespace by slug.
    const namespace = await getNamespace(payload.nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // Kick off delayed job to register contract instances.
    const scheduled = await enqueueDelayedJob('registerContractInstances', payload)
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})

/**
 * Decode all interactions with the given contract instances.
 */
app.post(paths.DECODE_CONTRACT_INTERACTIONS, async (req, res) => {
    if (!(await authorizeAdminRequest(req, res))) return

    const { group, instances = [] } = req.body
    if (!group || !instances?.length) {
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Kick off delayed job to decode contract interactions.
    for (const { chainId, address } of instances) {
        await enqueueDelayedJob('decodeContractInteractions', {
            group,
            chainId,
            contractAddresses: [address],
        })
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})
