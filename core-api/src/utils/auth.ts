import { AGServerSocket } from 'socketcluster-server'
import { logger, ClaimRole, CoreDB, Project } from '../../../shared'

const projects = () => CoreDB.getRepository(Project)

export async function authConnection(authKey: AGServerSocket.AuthToken): Promise<boolean> {
    if (authKey.role !== ClaimRole.Admin || !authKey.key) return false
    return await projectExistsWithAdminKey(authKey.key)
}

export async function projectExistsWithAdminKey(adminKey: string): Promise<boolean> {
    try {
        return (await projects().findOne({ where: { adminKey }, select: { id: true } })) !== null
    } catch (err) {
        logger.error(`Error finding Project by admin key: ${err}`)
        return false
    }
}
