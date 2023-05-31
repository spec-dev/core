import { app } from '../express'
import paths from '../../utils/paths'
import { parseContractInstanceRegistrationProgress } from './contractInstanceRegistrationPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { userHasNamespacePermissions } from '../../utils/auth'
import { enqueueDelayedJob, getNamespace, NamespaceUserRole, getContractInstanceRegistrationProgress } from '../../../../shared'

/**
 * Get updates for contracts in the delayed jobs queue
 * NOTE: if the status is NULL, the entry hasn't been created by delayed-jobs yet
 */
app.post(paths.REGISTER_CONTRACT_INSTANCE_PROGRESS, async (req, res) => {
    const user = await authorizeRequest(req, res)
    if (!user) return

    const { payload, isValid } = parseContractInstanceRegistrationProgress(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    const { status, cursor, failed, error } = await getContractInstanceRegistrationProgress(payload.uid)

    return res.status(codes.SUCCESS).json({ status, cursor, failed, error })
})
