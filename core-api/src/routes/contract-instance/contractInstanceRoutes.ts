import { app } from '../express'
import paths from '../../utils/paths'
import { parseNewContractInstancesPayload, parseDecodeContractInteractionsPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { userHasNamespacePermissions } from '../../utils/auth'
import { enqueueDelayedJob, getNamespace, NamespaceUserRole } from '../../../../shared'
import uuid4 from 'uuid4'

/**
 * Register new contract instances with Spec.
 */
app.post(paths.REGISTER_CONTRACT_INSTANCE, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    // Parse & validate payload.
    const { payload, isValid, error } = parseNewContractInstancesPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    // check if user has permissions to access namespace
    const { canAccess } = await userHasNamespacePermissions(user.id, payload.nsp, NamespaceUserRole.Member)
    if (!canAccess) {
        return res.status(codes.FORBIDDEN).json({ error: errors.UNAUTHORIZED })
    }
    // Find namespace by slug.
    const namespace = await getNamespace(payload.nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // Kick off delayed job to register contract instances.
    const uid = uuid4()
    const scheduled = await enqueueDelayedJob('registerContractInstances', {...payload, uid })
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true, uid })
})
