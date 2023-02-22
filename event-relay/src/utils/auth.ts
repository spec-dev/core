import { AGServerSocket } from 'socketcluster-server'
import { logger, ClaimRole, CoreDB, Project } from '../../../shared'

const projects = () => CoreDB.getRepository(Project)

export async function authConnection(
    authKey: AGServerSocket.AuthToken, 
    requireProjectExistence: boolean = false,
): Promise<boolean> {
    if (authKey.role === ClaimRole.EventPublisher) return true
    if (authKey.role !== ClaimRole.EventSubscriber || !authKey.key) return false
    if (!requireProjectExistence) return true
    return await projectExistsWithApiKey(authKey.key)
}

export async function projectExistsWithApiKey(apiKey: string): Promise<boolean> {
    try {
        return (
            await projects().findOne({ where: { apiKey }, select: { id: true } })
        ) !== null
    } catch (err) {
        logger.error(`Error finding Project by api key: ${err}`)
        return false
    }
}