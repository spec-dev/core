import logger from '../lib/logger'
import { exit } from 'process'
import { createProject } from '../lib/core/db/services/projectServices'

async function perform(name: string, orgId: number) {
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
