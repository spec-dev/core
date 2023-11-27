import { app } from '../express'
import paths from '../../utils/paths'
import { parseContractRegistrationPayload, parseAddContractsPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { 
    StringKeyMap, 
    uniqueByKeys, 
    enqueueDelayedJob, 
    getNamespace, 
    NamespaceAccessTokenScope, 
    addContractInstancesToGroup, 
    logger,
    createContractRegistrationJob, 
    getContractGroupAbi,
    getAbiSignature,
    getContractInstancesInNamespace,
} from '../../../../shared'

/**
 * [ASYNC] Register new contract instances with Spec.
 */
app.post(paths.REGISTER_CONTRACT_INSTANCES, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseContractRegistrationPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }

    // Find namespace by slug.
    const nsp = payload.nsp
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

    // TODO: Parallelize this with Promise.all(). Also need to handle massive group case.
    const delayedJobPayloads = []
    const jobGroups = []
    for (const group of payload.groups) {
        const groupName = [nsp, group.name].join('.')

        let existingInstances = await getContractInstancesInNamespace(groupName) as StringKeyMap[]
        if (existingInstances === null) {
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
        }

        existingInstances = existingInstances.map(({ chainId, address })=> ({ chainId, address }))
        const existingInstanceKeys = new Set(
            existingInstances.map(({ chainId, address }) => [chainId, address].join(':'))
        )

        const newInstances = group.instances.filter(({ chainId, address }) => (
            !existingInstanceKeys.has([chainId, address].join(':'))
        ))
        const allInstances = uniqueByKeys([
            ...existingInstances,
            ...newInstances,
        ], ['chainId', 'address'])

        const groupAbi = await getContractGroupAbi(groupName)
        if (groupAbi === null) {
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
        }

        const existingAbiSig = groupAbi.length ? getAbiSignature(groupAbi) : ''
        if (existingAbiSig === null) {
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
        }

        const givenAbiSig = group.abi && group.abi.length ? getAbiSignature(group.abi) : ''
        if (givenAbiSig === null) {
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
        }

        const abiChanged = givenAbiSig !== existingAbiSig
        if (!newInstances.length && !abiChanged) continue
    
        const instancesToDecode = abiChanged ? allInstances : newInstances
        const instanceKeys = []
        for (const { chainId, address } of instancesToDecode) {
            instanceKeys.push([chainId, address].join(':'))
        }

        jobGroups.push({
            name: group.name,
            instances: instanceKeys,
        })

        delayedJobPayloads.push({
            nsp,
            name: group.name,
            instances: newInstances,
            abi: group.abi,
            isFactoryGroup: group.isFactoryGroup,
            abiChanged,
        })
    }

    const job = await createContractRegistrationJob(nsp, jobGroups)
    if (!job) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }
    
    // Kick off delayed jobs to register contract instances.
    for (const payload of delayedJobPayloads) {
        const scheduled = await enqueueDelayedJob('registerContractInstances', { uid: job.uid, ...payload })
        if (!scheduled) {
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.JOB_SCHEDULING_FAILED })
        }
    }

    return res.status(codes.SUCCESS).json({ ok: true, uid: job.uid })
})

/**
 * [SYNC] Add new contract instances to an existing group.
 */
app.post(paths.ADD_CONTRACTS_TO_GROUP, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseAddContractsPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ ok: false, error: error || errors.INVALID_PAYLOAD })
    }

    // Find namespace by slug.
    const namespace = await getNamespace(payload.nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ ok: false, error: errors.NAMESPACE_NOT_FOUND })
    }

    // Authorize request for given namespace using either user auth header or namespace auth header.
    const allowedScopes = [
        NamespaceAccessTokenScope.RegisterContracts,
        NamespaceAccessTokenScope.Internal,
    ]
    if (!(await authorizeRequestForNamespace(req, res, namespace.name, allowedScopes))) return

    // Add new addresses to existing group.
    const { nsp, name, instances } = payload
    const group = [nsp, name].join('.')
    let newInstances = []
    try {
        newInstances = (await addContractInstancesToGroup(instances, group)).newInstances
    } catch (err) {
        logger.error(err)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false, error: err })
    }

    // Kick off delayed jobs to decode the new instances.
    if (newInstances.length) {
        try {
            for (const { chainId, address } of newInstances) {
                await enqueueDelayedJob('decodeContractInteractions', {
                    group,
                    chainId,
                    contractAddresses: [address],
                })
            }
        } catch (err) {
            logger.error(err)
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false, error: errors.INTERNAL_ERROR })
        }    
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})