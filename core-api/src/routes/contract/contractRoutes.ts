import { app } from '../express'
import paths from '../../utils/paths'
import { parseCreateContractGroupPayload } from './contractPayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { getNamespace, NamespaceAccessTokenScope, createContractGroup, getContractInstancesInGroup } from '../../../../shared'

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
    const instances = await getContractInstancesInGroup(req.query.group as string)
    return res.status(codes.SUCCESS).json({ ok: true, instances })
})
