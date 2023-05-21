import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { NamespaceUserRole } from '../lib/core/db/entities/NamespaceUser'
import { exit } from 'process'
import { createNamespaceUser } from '../lib/core/db/services/namespaceUserServices'

async function perform(namespaceId: number, userId: number, role: NamespaceUserRole) {
    await CoreDB.initialize()

    logger.info(`Creating NamespaceUser...`)
    const namespaceUser = await createNamespaceUser(Number(namespaceId), Number(userId), role)

    if (!namespaceUser) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info('Success.', namespaceUser.id)
    exit(0)
}

export default perform
