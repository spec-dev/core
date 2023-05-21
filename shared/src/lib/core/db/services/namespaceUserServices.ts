import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { NamespaceUserRole, NamespaceUser } from '../entities/NamespaceUser'
import uuid4 from 'uuid4'

const namespaceUsers = () => CoreDB.getRepository(NamespaceUser)

export async function createNamespaceUser(
    namespaceId: number,
    userId: number,
    role: NamespaceUserRole
): Promise<NamespaceUser> {
    const namespaceUser = new NamespaceUser()
    namespaceUser.uid = uuid4()
    namespaceUser.namespaceId = namespaceId
    namespaceUser.userId = userId
    namespaceUser.role = role

    try {
        await namespaceUsers().save(namespaceUser)
    } catch (err) {
        logger.error(
            `Error creating NamespaceUser(namespaceId=${namespaceId}, userId=${userId}): ${err}`
        )
        return null
    }

    return namespaceUser
}
