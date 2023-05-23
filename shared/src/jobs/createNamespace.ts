import { createNamespace } from '../lib/core/db/services/namespaceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(name: string) {
    await CoreDB.initialize()
    logger.info(`Creating namespace ${name}...`)

    const nsp = await createNamespace(name)
    logger.info('Success. namespace.id = ', nsp.id)

    exit(0)
}

export default perform
