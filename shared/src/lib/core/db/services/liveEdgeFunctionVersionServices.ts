import { LiveEdgeFunctionVersion } from '../entities/LiveEdgeFunctionVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const liveEdgeFunctionVersions = () => CoreDB.getRepository(LiveEdgeFunctionVersion)

export async function createLiveEdgeFunctionVersion(
    liveObjectVersionId: number,
    edgeFunctionVersionId: number
): Promise<LiveEdgeFunctionVersion> {
    const liveEdgeFunctionVersion = new LiveEdgeFunctionVersion()
    liveEdgeFunctionVersion.liveObjectVersionId = liveObjectVersionId
    liveEdgeFunctionVersion.edgeFunctionVersionId = edgeFunctionVersionId

    try {
        await liveEdgeFunctionVersions().save(liveEdgeFunctionVersion)
    } catch (err) {
        logger.error(
            `Error creating LiveEdgeFunctionVersion(liveObjectVersionId=${liveObjectVersionId}, 
            edgeFunctionVersionId=${edgeFunctionVersionId}): ${err}`
        )
        throw err
    }

    return liveEdgeFunctionVersion
}
