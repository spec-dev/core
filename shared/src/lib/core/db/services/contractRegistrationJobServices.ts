import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import {
    ContractRegistrationJob,
    ContractRegistrationJobStatus,
} from '../entities/ContractRegistrationJob'
import uuid4 from 'uuid4'
import { ContractRegistrationPayload } from '../../../types'

const contractRegistrationJobsRepo = () => CoreDB.getRepository(ContractRegistrationJob)

export async function createContractRegistrationJob(
    data: ContractRegistrationPayload
): Promise<ContractRegistrationJob> {
    const contractRegistrationJob = new ContractRegistrationJob()
    contractRegistrationJob.uid = uuid4()
    contractRegistrationJob.nsp = data.nsp
    contractRegistrationJob.status = ContractRegistrationJobStatus.Created

    const groups = []
    const cursors = []
    for (const group of data.groups) {
        const { name, instances } = group
        groups.push({ name, instances })
        const cursor = {}
        for (const instance of instances) {
            const key = [instance.chainId, instance.address].join(':')
            cursor[key] = 0
        }
        cursors.push(cursor)
    }
    contractRegistrationJob.groups = groups
    contractRegistrationJob.cursors = cursors

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
