import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import {
    ContractRegistrationJob,
    ContractRegistrationJobStatus,
} from '../entities/ContractRegistrationJob'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'

const contractRegistrationJobsRepo = () => CoreDB.getRepository(ContractRegistrationJob)

export async function createContractRegistrationJob(
    nsp: string,
    contractName: string,
    addresses: string[],
    chainId: string,
    uid?: string | null
): Promise<ContractRegistrationJob> {
    const contractRegistrationJob = new ContractRegistrationJob()
    contractRegistrationJob.uid = uid || uuid4()
    contractRegistrationJob.nsp = nsp
    contractRegistrationJob.contractName = contractName
    contractRegistrationJob.addresses = addresses || []
    contractRegistrationJob.chainId = chainId
    contractRegistrationJob.status = ContractRegistrationJobStatus.Created
    contractRegistrationJob.cursors = {}

    try {
        await contractRegistrationJobsRepo().save(contractRegistrationJob)
    } catch (err) {
        throw `Error creating ContractRegistrationJob(uid=${uid}): ${err}`
    }

    return contractRegistrationJob
}

export async function getContractRegistrationJob(uid: string): Promise<StringKeyMap> {
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

export async function updateContractRegistrationJobCursors(
    uid: string,
    addresses: string[],
    progress: number
): Promise<boolean> {
    try {
        const updates = {}
        for (const address of addresses) {
            updates[address] = progress
        }
        await CoreDB.query(
            `update contract_registration_jobs set cursors = cursors || '${JSON.stringify(
                updates
            )}' where uid = $1`,
            [uid]
        )
    } catch (err) {
        logger.error(
            `Error setting cursors to ${progress} in ContractRegistrationJob(uid=${uid}) 
            for addresses ${addresses.join(', ')}: ${err}`
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
