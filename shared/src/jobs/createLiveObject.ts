import { createLiveObject } from '../lib/core/db/services/liveObjectServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { getNamespace } from '../lib/core/db/services/namespaceServices'

async function perform(nsp: any, name: string, desc: string) {
    await CoreDB.initialize()

    const namespace = await getNamespace(nsp)
    if (!namespace) {
        logger.error(`No namespace for slug: ${nsp}`)
        exit(1)
    }

    logger.info(`Creating live_object ${name}...`)
    await createLiveObject(namespace.id, name, desc)
    logger.info('Success.')
    exit(0)
}

export default perform