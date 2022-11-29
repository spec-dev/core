import {
    getLiveObjectVersionsByNamespacedVersions,
    updateLiveObjectVersionExample,
} from '../lib/core/db/services/liveObjectVersionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(namespacedVersion: string, example: string) {
    await CoreDB.initialize()

    const liveObjectVersions = await getLiveObjectVersionsByNamespacedVersions([namespacedVersion])
    if (!liveObjectVersions || !liveObjectVersions.length) {
        logger.error(`No live_object_version found for ${namespacedVersion}.`)
        exit(1)
    }
    const liveObjectVersion = liveObjectVersions[0]

    logger.info(`Setting live_object_version ${namespacedVersion} example...`)
    await updateLiveObjectVersionExample(liveObjectVersion.id, JSON.parse(example))

    logger.info('Success.')
    exit(0)
}

export default perform
