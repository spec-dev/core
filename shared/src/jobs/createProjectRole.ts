import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { ProjectRoleName } from '../lib/core/db/entities/ProjectRole'
import { exit } from 'process'
import { createProjectRole } from '../lib/core/db/services/projectRoleServices'

async function perform(projectId: number, orgUserId: number, role: ProjectRoleName) {
    await CoreDB.initialize()

    logger.info(`Creating ProjectRole...`)
    const projectRole = await createProjectRole(Number(projectId), Number(orgUserId), role)

    if (!projectRole) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info('Success.')
    exit(0)
}

export default perform