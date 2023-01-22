import { LiveEventVersion } from '../entities/LiveEventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'

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

export async function createLiveEventVersionsWithTx(
    data: StringKeyMap[],
    tx: any
): Promise<LiveEventVersion[]> {
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(LiveEventVersion)
                .values(data)
                .returning('*')
                .execute()
        ).generatedMaps
    )
}