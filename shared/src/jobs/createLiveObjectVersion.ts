import { createLiveObjectVersion } from '../lib/core/db/services/liveObjectVersionServices'
import { getLiveObject } from '../lib/core/db/services/liveObjectServices'
import { getNamespace } from '../lib/core/db/services/namespaceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(nsp: any, name: string, version: string) {
    await CoreDB.initialize()

    const namespace = await getNamespace(nsp)
    if (!namespace) {
        logger.error(`No namespace for slug: ${nsp}`)
        exit(1)
    }

    const liveObject = await getLiveObject(namespace.id, name)
    if (!liveObject) {
        logger.error(`No live_object for namespace_id (${namespace.id}), name (${name}).`)
        exit(1)
    }

    logger.info(`Creating live_object_version ${nsp}.${name}@${version}...`)
    await createLiveObjectVersion(nsp, liveObject.id, name, version)
    logger.info('Success.')

    exit(0)
}

export default perform
