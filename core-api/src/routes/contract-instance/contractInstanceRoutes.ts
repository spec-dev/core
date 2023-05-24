import { app } from '../express'
import paths from '../../utils/paths'
import { parseNewContractInstancesPayload, parseDecodeContractInteractionsPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { userHasNamespacePermissions } from '../../utils/auth'
import { enqueueDelayedJob, getNamespace, NamespaceUserRole } from '../../../../shared'

/**
 * Register new contract instances with Spec.
 */
app.post(paths.REGISTER_CONTRACT_INSTANCE, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    console.log('im in the route')

    // // Parse & validate payload.
    // const { payload, isValid, error } = parseNewContractInstancesPayload(req.body)
    // if (!isValid) {
    //     return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    // }

    // if (!userHasNamespacePermissions(user.id, payload.nsp, NamespaceUserRole.Member)) {
    //     return res.status(codes.FORBIDDEN).json({ error: errors.UNAUTHORIZED })
    // }

    // // Find namespace by slug.
    // const namespace = await getNamespace(payload.nsp)
    // if (!namespace) {
    //     return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    // }

    // // Kick off delayed job to register contract instances.
    // const scheduled = await enqueueDelayedJob('registerContractInstances', payload)
    // if (!scheduled) {
    //     return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    // }

    return res.status(codes.SUCCESS).json({ ok: true })
})
