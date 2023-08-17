import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import {
    PublishAndDeployLiveObjectVersionJob,
    PublishAndDeployLiveObjectVersionJobStatus,
} from '../entities/PublishAndDeployLiveObjectVersionJob'
import uuid4 from 'uuid4'

const publishAndDeployLiveObjectVersionJobRepo = () => CoreDB.getRepository(PublishAndDeployLiveObjectVersionJob)

export async function createPublishAndDeployLiveObjectVersionJobServices(
    nsp: string,
    name: string,
    folder: string,
    version: string,
    uid?: string | null
): Promise<PublishAndDeployLiveObjectVersionJob> {
    const publishAndDeployLiveObjectVersionJob = new PublishAndDeployLiveObjectVersionJob()
    publishAndDeployLiveObjectVersionJob.uid = uid || uuid4()
    publishAndDeployLiveObjectVersionJob.nsp = nsp
    publishAndDeployLiveObjectVersionJob.name = name
    publishAndDeployLiveObjectVersionJob.folder = folder
    publishAndDeployLiveObjectVersionJob.version = version
    publishAndDeployLiveObjectVersionJob.status = PublishAndDeployLiveObjectVersionJobStatus.Created
    publishAndDeployLiveObjectVersionJob.cursors = {}

    try {
        await publishAndDeployLiveObjectVersionJobRepo().save(publishAndDeployLiveObjectVersionJob)
    } catch (err) {
        throw `Error creating PublishAndDeployLiveObjectVersionJob(uid=${uid}): ${err}`
    }

    return publishAndDeployLiveObjectVersionJob
}

export async function getPublishAndDeployLiveObjectVersionJob(
    uid: string
): Promise<PublishAndDeployLiveObjectVersionJob | null> {
    try {
        return await publishAndDeployLiveObjectVersionJobRepo().findOneBy({ uid })
    } catch (err) {
        logger.error(`Error finding PublishAndDeployLiveObjectVersionJob(uid=${uid}: ${err}`)
        return null
    }
}

export async function updatePublishAndDeployLiveObjectVersionJobStatus(
    uid: string,
    status: PublishAndDeployLiveObjectVersionJobStatus
): Promise<boolean> {
    try {
        await publishAndDeployLiveObjectVersionJobRepo()
            .createQueryBuilder()
            .update({ status })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(
            `Error setting PublishAndDeployLiveObjectVersionJob(uid=${uid}) to status ${status}: ${err}`
        )
        return false
    }
    return true
}

export async function updatePublishAndDeployLiveObjectVersionJobCursors(
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
            `update publish_and_deploy_live_object_version_jobs set cursors = cursors || '${JSON.stringify(
                updates
            )}' where uid = $1`,
            [uid]
        )
    } catch (err) {
        logger.error(
            `Error setting cursors to ${progress} in PublishAndDeployLiveObjectVersionJob(uid=${uid}) 
            for addresses ${addresses.join(', ')}: ${err}`
        )
        return false
    }
    return true
}

export async function publishAndDeployLiveObjectVersionJobFailed(uid: string, error?: string) {
    try {
        await publishAndDeployLiveObjectVersionJobRepo()
            .createQueryBuilder()
            .update({ failed: true, error })
            .where({ uid })
            .execute()
    } catch (err) {
        logger.error(`Error setting PublishAndDeployLiveObjectVersionJob(uid=${uid}) to failed: ${err}`)
    }
}
