import { app } from '../express'
import paths from '../../utils/paths'
import { parseContractRegistrationPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { enqueueDelayedJob, getNamespace, NamespaceAccessTokenScope } from '../../../../shared'
import uuid4 from 'uuid4'

/**
 * Register new contract instances with Spec.
 */
app.post(paths.REGISTER_CONTRACT_INSTANCES, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseContractRegistrationPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find namespace by slug.
    const namespace = await getNamespace(payload.nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // // Authorize request for given namespace using either user auth header or namespace auth header.
    // const allowedScopes = [
    //     NamespaceAccessTokenScope.RegisterContracts,
    //     NamespaceAccessTokenScope.Internal,
    // ]
    // if (!(await authorizeRequestForNamespace(req, res, namespace.name, allowedScopes))) return

    // Create a uid ahead of time that will be used as the uid for a new ContractRegistrationJob
    // that will get created inside of the registerContractInstances delayed job. We're creating
    // this uid now so that we can return it to the caller and they can poll for the job status.
    const uid = uuid4()

    // Kick off delayed job to register contract instances.
    const scheduled = await enqueueDelayedJob('registerContractInstances', { ...payload, uid })
    if (!scheduled) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    }

    return res.status(codes.SUCCESS).json({ ok: true, uid })
})
