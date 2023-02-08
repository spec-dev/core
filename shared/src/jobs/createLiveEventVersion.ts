import { createLiveEventVersion } from '../lib/core/db/services/liveEventVersionServices'
import { getLiveObjectVersionsByNamespacedVersions } from '../lib/core/db/services/liveObjectVersionServices'
import { getEventVersion } from '../lib/core/db/services/eventVersionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(lov: string, eventVersion: string, isInput: boolean) {
    await CoreDB.initialize()

    const liveObjectVersion = (await getLiveObjectVersionsByNamespacedVersions([lov]))[0]
    if (!liveObjectVersion) {
        logger.error(`No live object versions: ${lov}`)
        exit(1)
    }

    const [nspName, version] = eventVersion.split('@')
    const [nsp, name] = nspName.split('.')
    const eventVersionRecord = await getEventVersion(nsp, name, version)
    if (!eventVersionRecord) {
        logger.error(`No event_version for nsp (${nsp}), name (${name}), version (${version}).`)
        exit(1)
    }

    logger.info(`Creating live_event_version ${nsp}.${name}@${version}...`)
    await createLiveEventVersion(liveObjectVersion.id, eventVersionRecord.id, isInput)
    logger.info('Success.')
    exit(0)
}

export default perform
