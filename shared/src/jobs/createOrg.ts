import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { createOrg } from '../lib/core/db/services/orgServices'

async function perform(name: string) {
    await CoreDB.initialize()

    logger.info(`Creating org ${name}...`)
    const org = await createOrg(name)

    if (!org) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info('Success.')
    exit(0)
}

export default perform
