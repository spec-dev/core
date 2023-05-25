import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import {
    ContractInstanceRegistration,
    ContractInstanceRegistrationStatus,
} from '../entities/ContractInstanceRegistration'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'

const contractInstanceRegistrationsRepo = () => CoreDB.getRepository(ContractInstanceRegistration)

export async function createContractInstanceRegistration(
    contractInstanceId: number,
    uid?: string | null
): Promise<ContractInstanceRegistration> {
    const contractInstanceRegistration = new ContractInstanceRegistration()
    contractInstanceRegistration.uid = uid || uuid4()
    contractInstanceRegistration.contractInstanceId = contractInstanceId

    try {
        await contractInstanceRegistrationsRepo().save(contractInstanceRegistration)
    } catch (err) {
        logger.error(
            `Error creating ContractInstanceRegistration(uid=${uid}, contractInstanceRegistration=${contractInstanceRegistration}): ${err}`
        )
        throw err
    }

    return contractInstanceRegistration
}

export async function getContractInstanceRegistrationProgress(
    uid: string
): Promise<StringKeyMap> {
    let status = null
    let cursor = null
    let failed = false
    let error = null
    try {
        const contractInstanceRegistration = await contractInstanceRegistrationsRepo().findOneBy({
            uid,
        })
        status = contractInstanceRegistration?.status || null
        cursor = contractInstanceRegistration?.cursor || null
        failed = contractInstanceRegistration?.failed || false
        error = contractInstanceRegistration?.error || null
    } catch (err) {
        logger.error(`Error finding ContractInstanceRegistration(uid=${uid}: ${err}`)
    }
    return { status, cursor, failed, error }
}

export async function updateContractInstanceRegistrationStatus(
    uid: string,
    status: ContractInstanceRegistrationStatus
): Promise<boolean> {
    try {
        await contractInstanceRegistrationsRepo()
            .createQueryBuilder()
            .update({ status })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(
            `Error setting ContractInstanceRegistration(uid=${uid}) to status ${status}: ${err}`
        )
        return false
    }
    return true
}

export async function updateContractInstanceRegistrationCursor(
    uid: string,
    cursor: number
): Promise<boolean> {
    try {
        await contractInstanceRegistrationsRepo()
            .createQueryBuilder()
            .update({ cursor })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(
            `Error updating ContractInstanceRegistration(uid=${uid}) cursor to ${cursor}: ${err}`
        )
        return false
    }
    return true
}

export async function contractInstanceRegistrationFailed(uid: string, error?: string) {
    try {
        await contractInstanceRegistrationsRepo()
            .createQueryBuilder()
            .update({ failed: true, error })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(`Error setting ContractInstanceRegistration(uid=${uid}) to failed: ${err}`)
    }
}
