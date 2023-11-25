import { app } from '../express'
import paths from '../../utils/paths'
import { parseContractRegistrationPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { enqueueDelayedJob, getNamespace, NamespaceAccessTokenScope, contractNamespaceForChainId, addContractInstancesToGroup, logger, createContractRegistrationJob } from '../../../../shared'
import uuid4 from 'uuid4'

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

    const job = await createContractRegistrationJob(payload)
    if (!job) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error: errors.INTERNAL_ERROR })
    }
    
    // Kick off delayed jobs to register contract instances.
    for (let i = 0; i < payload.groups.length; i++) {
        const group = payload.groups[i]
        const scheduled = await enqueueDelayedJob('registerContractInstances', { 
            nsp,
            groupIndex: i,
            uid: job.uid,
            ...group,
        })
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
    const { payload, isValid, error } = parseContractRegistrationPayload(req.body)
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
    const { nsp, name, instances, chainId } = payload
    const contractGroup = [nsp, name].join('.')
    const contractAddresses = instances.map(i => i.address)
    const chainSpecificContractNsp = contractNamespaceForChainId(chainId)
    const fullNsp = [chainSpecificContractNsp, contractGroup].join('.')
    let newAddresses = []
    try {
        newAddresses = (await addContractInstancesToGroup(contractAddresses, chainId, contractGroup)).newAddresses
    } catch (err) {
        logger.error(err)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false, error: err })
    }

    // Kick off delayed jobs to decode the addresses.
    if (newAddresses.length) {
        try {
            for (const contractAddress of contractAddresses) {
                await enqueueDelayedJob('decodeContractInteractions', {
                    chainId,
                    contractAddresses: [contractAddress],
                    fullContractGroup: fullNsp,
                })
            }
        } catch (err) {
            logger.error(err)
            return res.status(codes.INTERNAL_SERVER_ERROR).json({ ok: false, error: errors.INTERNAL_ERROR })
        }    
    }

    return res.status(codes.SUCCESS).json({ ok: true })
})