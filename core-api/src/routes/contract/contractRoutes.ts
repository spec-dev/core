import { app } from '../express'
import paths from '../../utils/paths'
import { parseCreateContractGroupPayload } from './contractPayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { getNamespace, NamespaceAccessTokenScope, createContractGroup } from '../../../../shared'
import getContractGroup from '../../services/getContractGroup'

/**
 * Create a new, empty contract group.
 */
app.post(paths.CONTRACT_GROUP, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseCreateContractGroupPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { chainIds, nsp, name, abi } = payload

    // Find namespace by slug.
    const namespace = await getNamespace(nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // Authorize request for given namespace using either user auth header or namespace auth header.
    const allowedScopes = [
        NamespaceAccessTokenScope.RegisterContracts,
        NamespaceAccessTokenScope.Internal,
    ]
    if (!(await authorizeRequestForNamespace(req, res, namespace.name, allowedScopes))) return

    // Try to create the new group.
    try {
        await createContractGroup(nsp, name, chainIds, abi)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    return res.status(codes.SUCCESS).json({ error: null })
})

/**
 * Get contract group where object is { [chainId]: addresses[]}
 */
app.get(paths.CONTRACT_GROUP, async (req, res) => {
    await getContractGroup(req.query.group as string)

    // // Parse & validate payload.
    // const { payload, isValid, error } = parseContractRegistrationPayload(req.body)
    // if (!isValid) {
    //     return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    // }

    // // Find namespace by slug.
    // const namespace = await getNamespace(payload.nsp)
    // if (!namespace) {
    //     return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    // }

    // // Authorize request for given namespace using either user auth header or namespace auth header.
    // const allowedScopes = [NamespaceAccessTokenScope.RegisterContracts, NamespaceAccessTokenScope.Internal]
    // if (!(await authorizeRequestForNamespace(req, res, namespace.name, allowedScopes))) return

    // // Create a uid ahead of time that will be used as the uid for a new ContractRegistrationJob
    // // that will get created inside of the registerContractInstances delayed job. We're creating
    // // this uid now so that we can return it to the caller and they can poll for the job status.
    // const uid = uuid4()

    // // Kick off delayed job to register contract instances.
    // const scheduled = await enqueueDelayedJob('registerContractInstances', { ...payload, uid })
    // if (!scheduled) {
    //     return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
    // }

    return res.status(codes.SUCCESS).json({ ok: true })
})
