import { createNamespace } from '../lib/core/db/services/namespaceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(name: string) {
    await CoreDB.initialize()
    logger.info(`Creating namespace ${name}...`)

    await createNamespace(name)
    logger.info('Success.')

    exit(0)
}

export default perform