import { AGServerSocket } from 'socketcluster-server'
import { logger, ClaimRole, CoreDB, Project } from '../../../shared'

const projects = () => CoreDB.getRepository(Project)

export async function authConnection(authKey: AGServerSocket.AuthToken): Promise<boolean> {
    logger.info('authConnection')
    if (authKey.role === ClaimRole.EventPublisher) return true
    if (authKey.role !== ClaimRole.EventSubscriber || !authKey.key) return false
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