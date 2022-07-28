import { LiveObjectVersion } from '../entities/LiveObjectVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const liveObjectVersions = () => CoreDB.getRepository(LiveObjectVersion)

export async function createLiveObjectVersion(
    nsp: string,
    liveObjectId: number,
    name: string,
    version: string
): Promise<LiveObjectVersion> {
    const liveObjectVersion = new LiveObjectVersion()
    liveObjectVersion.uid = uuid4()
    liveObjectVersion.nsp = nsp
    liveObjectVersion.name = name
    liveObjectVersion.version = version
    liveObjectVersion.liveObjectId = liveObjectId

    try {
        await liveObjectVersions().save(liveObjectVersion)
    } catch (err) {
        logger.error(
            `Error creating LiveObjectVersion(nsp=${nsp}, name=${name}, version=${version}): ${err}`
        )
        throw err
    }

    return liveObjectVersion
}
