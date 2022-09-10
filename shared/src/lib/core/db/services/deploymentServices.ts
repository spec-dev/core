import { Deployment, DeploymentStatus } from '../entities/Deployment'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import short from 'short-uuid'

const deployments = () => CoreDB.getRepository(Deployment)

export async function createDeployment(projectId: number): Promise<Deployment | null> {
    const deployment = new Deployment()
    deployment.projectId = projectId
    deployment.version = short.generate()

    try {
        return await deployments().save(deployment)
    } catch (err) {
        logger.error(`Error creating Deployment(projectId=${projectId}): ${err}`)
        return null
    }
}

export async function updateDeploymentStatus(
    id: number,
    status: DeploymentStatus
): Promise<boolean> {
    try {
        await deployments().createQueryBuilder().update({ status }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting Deployment(id=${id}) to status ${status}: ${err}`)
        return false
    }
    return true
}

export async function deploymentFailed(id: number) {
    try {
        await deployments().createQueryBuilder().update({ failed: true }).where({ id }).execute()
    } catch (err) {
        logger.error(`Error setting Deployment(id=${id}) to failed: ${err}`)
    }
}
