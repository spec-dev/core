import { LiveEventVersion } from '../entities/LiveEventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const liveEventVersions = () => CoreDB.getRepository(LiveEventVersion)

export async function createLiveEventVersion(
    liveObjectVersionId: number,
    eventVersionId: number
): Promise<LiveEventVersion> {
    const liveEventVersion = new LiveEventVersion()
    liveEventVersion.liveObjectVersionId = liveObjectVersionId
    liveEventVersion.eventVersionId = eventVersionId

    try {
        await liveEventVersions().save(liveEventVersion)
    } catch (err) {
        logger.error(
            `Error creating LiveEventVersion(liveObjectVersionId=${liveObjectVersionId}, 
            eventVersionId=${eventVersionId}): ${err}`
        )
        throw err
    }

    return liveEventVersion
}
