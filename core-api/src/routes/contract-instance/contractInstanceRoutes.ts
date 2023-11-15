import { app } from '../express'
import paths from '../../utils/paths'
import { parseContractRegistrationPayload } from './contractInstancePayloads'
import { codes, errors, authorizeRequestForNamespace } from '../../utils/requests'
import { enqueueDelayedJob, getNamespace, NamespaceAccessTokenScope, contractNamespaceForChainId, addContractInstancesToGroup, logger } from '../../../../shared'
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
    const namespace = await getNamespace(payload.nsp)
    if (!namespace) {
        return res.status(codes.NOT_FOUND).json({ error: errors.NAMESPACE_NOT_FOUND })
    }

    // Authorize request for given namespace using either user auth header or namespace auth header.
    const allowedScopes = [
        NamespaceAccessTokenScope.RegisterContracts,
        NamespaceAccessTokenScope.Internal,
    ]
    if (!(await authorizeRequestForNamespace(req, res, namespace.name, allowedScopes))) return

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