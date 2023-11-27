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
    getOldestContractInGroup,
    unique,
} from '../../../../shared'
import searchLiveObjects from '../../services/searchLiveObjects'

/**
 * Create a new, empty contract group.
 */
app.post(paths.CONTRACT_GROUP, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseCreateContractGroupPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { nsp, name, isFactoryGroup, abi } = payload

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
        await createContractGroup(nsp, name, abi, isFactoryGroup)
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
 * Get contract group page.
 */
 app.get(paths.CONTRACT_GROUP_PAGE, async (req, res) => {
    const { payload, isValid, error } = parseContractGroupPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { group } = payload
    const [nsp, contractName] = group.split('.')
    const [namespace, oldestContractResults, instances, eventResp] = await Promise.all([
        getNamespace(nsp),
        getOldestContractInGroup(group),
        getContractInstancesInGroup(group),
        searchLiveObjects(null, group, {}, 0, 1000),
    ])
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }
    if (!oldestContractResults?.length) {
        return res.status(codes.NOT_FOUND).json({ error: errors.CONTRACT_GROUP_NOT_FOUND })
    }
    if (!instances) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }
    if (eventResp.error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: eventResp.error })
    }
    const createdAt = oldestContractResults[0].createdAt

    let name = contractName
    let numInstances = 0
    let updatedAt = new Date(createdAt)
    for (const chainId in instances) {
        const chainSpecificInstances = instances[chainId]
        for (const instance of chainSpecificInstances) {
            numInstances++
            name = instance.name
            const instanceCreatedAt = new Date(instance.createdAt)
            if (instanceCreatedAt > updatedAt) {
                updatedAt = instanceCreatedAt
            }
        }
    }

    const events = (eventResp.data || []).filter(liveObject => liveObject.latestVersion?.nsp === group)
    const contractGroup = {
        name,
        numInstances,
        createdAt,
        updatedAt,
        namespace: await namespace.publicView(),
        instances,
        events,
    }

    return res.status(codes.SUCCESS).json(contractGroup)
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

    const contractGroups = contracts.map(contract => ({
        contractCount: (contract.contractInstances || []).length,
        chainIds: unique((contract.contractInstances || []).map(ci => ci.chainId)),
    }))

    return res.status(codes.SUCCESS).json(contractGroups)
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
