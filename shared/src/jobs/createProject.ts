import logger from '../lib/logger'
import { exit } from 'process'
import { CoreDB } from '../lib/core/db/dataSource'
import { createProject } from '../lib/core/db/services/projectServices'

async function perform(name: string, orgId: number) {
    await CoreDB.initialize()

    logger.info(`Creating project ${name}...`)
    const project = await createProject(name, Number(orgId))

    if (!project) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info(`Success. project.id = `, project.id)
    exit(0)
}

export default perform