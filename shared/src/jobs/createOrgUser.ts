import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { OrgUserRole } from '../lib/core/db/entities/OrgUser'
import { exit } from 'process'
import { createOrgUser } from '../lib/core/db/services/orgUserServices'

async function perform(orgId: number, userId: number, role: OrgUserRole) {
    await CoreDB.initialize()

    logger.info(`Creating OrgUser...`)
    const orgUser = await createOrgUser(Number(orgId), Number(userId), role)

    if (!orgUser) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info('Success.')
    exit(0)
}

export default perform
