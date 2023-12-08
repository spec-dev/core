import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import {
    ContractRegistrationJob,
    ContractRegistrationJobStatus,
} from '../entities/ContractRegistrationJob'
import { StringKeyMap } from '../../../types'
import uuid4 from 'uuid4'

const contractRegistrationJobsRepo = () => CoreDB.getRepository(ContractRegistrationJob)

export async function createContractRegistrationJob(
    nsp: string,
    groups: StringKeyMap[]
): Promise<ContractRegistrationJob> {
    const contractRegistrationJob = new ContractRegistrationJob()
    contractRegistrationJob.uid = uuid4()
    contractRegistrationJob.nsp = nsp
    contractRegistrationJob.status = ContractRegistrationJobStatus.Created
    contractRegistrationJob.groups = groups || []

    try {
        await contractRegistrationJobsRepo().save(contractRegistrationJob)
    } catch (err) {
        logger.error(`Error creating ContractRegistrationJob: ${err}`)
        return null
    }

    return contractRegistrationJob
}

export async function getContractRegistrationJob(
    uid: string
): Promise<ContractRegistrationJob | null> {
    try {
        return await contractRegistrationJobsRepo().findOneBy({ uid })
    } catch (err) {
        logger.error(`Error finding ContractRegistrationJob(uid=${uid}: ${err}`)
        return null
    }
}

export async function updateContractRegistrationJobStatus(
    uid: string,
    status: ContractRegistrationJobStatus
): Promise<boolean> {
    try {
        await contractRegistrationJobsRepo()
            .createQueryBuilder()
            .update({ status })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(
            `Error setting ContractRegistrationJob(uid=${uid}) to status ${status}: ${err}`
        )
        return false
    }
    return true
}

export async function contractRegistrationJobFailed(uid: string, error?: string) {
    try {
        await contractRegistrationJobsRepo()
            .createQueryBuilder()
            .update({ failed: true, error })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(`Error setting ContractRegistrationJob(uid=${uid}) to failed: ${err}`)
    }
}
