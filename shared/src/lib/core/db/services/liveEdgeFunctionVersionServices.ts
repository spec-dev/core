import {
    LiveEdgeFunctionVersion,
    LiveEdgeFunctionVersionRole,
} from '../entities/LiveEdgeFunctionVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const liveEdgeFunctionVersions = () => CoreDB.getRepository(LiveEdgeFunctionVersion)

export async function createLiveEdgeFunctionVersion(
    liveObjectVersionId: number,
    edgeFunctionVersionId: number,
    role: LiveEdgeFunctionVersionRole,
    argsMap?: object,
    metadata?: object
): Promise<LiveEdgeFunctionVersion> {
    const liveEdgeFunctionVersion = new LiveEdgeFunctionVersion()
    liveEdgeFunctionVersion.liveObjectVersionId = liveObjectVersionId
    liveEdgeFunctionVersion.edgeFunctionVersionId = edgeFunctionVersionId
    liveEdgeFunctionVersion.role = role
    liveEdgeFunctionVersion.argsMap = argsMap
    liveEdgeFunctionVersion.metadata = metadata

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
