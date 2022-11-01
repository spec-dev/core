import { createEventVersion } from '../lib/core/db/services/eventVersionServices'
import { getEvent } from '../lib/core/db/services/eventServices'
import { getNamespace } from '../lib/core/db/services/namespaceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(nsp: any, eventName: string, name: string, version: string, chainId: any) {
    await CoreDB.initialize()

    const namespace = await getNamespace(nsp)
    if (!namespace) {
        logger.error(`No namespace for slug: ${nsp}`)
        exit(1)
    }

    const event = await getEvent(namespace.id, eventName)
    if (!event) {
        logger.error(`No event for namespace_id (${namespace.id}), name (${eventName}).`)
        exit(1)
    }

    logger.info(`Creating event_version ${nsp}.${name}@${version}...`)
    await createEventVersion(nsp, event.id, name, version, chainId)
    logger.info('Success.')
    exit(0)
}

export default perform
