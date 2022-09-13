import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { createProject } from '../lib/core/db/services/projectServices'

async function perform(name: string, orgId: number) {
    await CoreDB.initialize()

    logger.info(`Creating project ${name}...`)
    const project = await createProject(name, Number(orgId))

    if (!project) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info(`Success.`)
    exit(0)
}

export default perform
