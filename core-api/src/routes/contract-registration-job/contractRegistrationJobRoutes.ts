import { app } from '../express'
import paths from '../../utils/paths'
import { parseGetContractRegistrationJobPayload } from './contractRegistrationJobPayloads'
import { codes, errors, authorizeRequest } from '../../utils/requests'
import { getContractRegistrationJob } from '../../../../shared'

/**
 * Get a contract registration job by uid.
 */
app.get(paths.CONTRACT_REGISTRATION_JOB, async (req, res) => {
    // const user = await authorizeRequest(req, res)
    // if (!user) return

    // Parse & validate payload.
    const { payload, isValid } = parseGetContractRegistrationJobPayload(req.query)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Find & return contract registration job by uid.
    const contractRegistrationJob = await getContractRegistrationJob(payload.uid)
    const data = contractRegistrationJob ? await contractRegistrationJob.view() : {}
    return res.status(codes.SUCCESS).json(data)
})
