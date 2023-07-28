import { app } from '../express'
import paths from '../../utils/paths'
import { parseCreateContractGroupPayload, parseContractGroupPayload, parseContractGroupsPayload } from './contractPayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { 
    getNamespace, 
    NamespaceAccessTokenScope, 
    createContractGroup, 
    getContractInstancesInGroup, 
    getContractEventsForGroup, 
    getAllContractGroups, 
    chainIdForContractNamespace 
} from '../../../../shared'
import { StringKeyMap } from '../../types'
import { contractGroupNameFromNamespace } from '../../utils/extract'

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
 * Get contract group where object is { [chainId]: ContractInstance[] }
 */
app.get(paths.CONTRACT_GROUP, async (req, res) => {
    const { payload, isValid, error } = parseContractGroupPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const instances = await getContractInstancesInGroup(payload.group)
    if (!instances) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    return res.status(codes.SUCCESS).json({ error: null, instances })
})

/**
 * Get all contract groups.
 */
app.post(paths.CONTRACT_GROUPS, async (req, res) => {
    const { payload, isValid, error } = parseContractGroupsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    
    const { filters } = payload
    const contracts = await getAllContractGroups(filters)
    if (!contracts) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    const groups:StringKeyMap = {}
    const groupedContracts = []

    contracts.forEach(contract => {
        const groupName = contractGroupNameFromNamespace(contract.namespace.slug)
        if (!groupName) return

        const chainId = chainIdForContractNamespace(contract.namespace.slug)
        groups[groupName] = groups[groupName] || {chainIds: [], contractCount: 0}
        groups[groupName].chainIds.push(chainId)
        groups[groupName].contractCount += contract.contractInstances.length
    })

    Object.entries(groups).forEach(([groupName, values]) => 
        groupedContracts.push({ 
            groupName, 
            ...values 
        })
    )
    return res.status(codes.SUCCESS).json(groupedContracts)
})

/**
 * Get all contract events for a given group.
 */
app.get(paths.CONTRACT_GROUP_EVENTS, async (req, res) => {
    const { payload, isValid, error } = parseContractGroupPayload(req.query)

    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    const events = await getContractEventsForGroup(payload.group)

    if (!events) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }

    return res.status(codes.SUCCESS).json({ error: null, events })
})
