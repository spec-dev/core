import { StringKeyMap, LatestLiveObject } from '../types'
import { CoreDB, LiveObject, LiveObjectVersion, logger } from '../../../shared'

async function searchLiveObjects(query?: StringKeyMap): Promise<StringKeyMap> {
    // TODO: Actually implement search functionality using the latest versions of each live object cached in redis.
    // HACK: Right now just return all live objects with their current version.
    let results
    try {
        results = await CoreDB.getRepository(LiveObjectVersion)
            .createQueryBuilder('liveObjectVersion')
            .distinctOn(['liveObjectVersion.liveObjectId'])
            .leftJoinAndSelect('liveObjectVersion.liveObject', 'liveObject')
            .orderBy('liveObjectVersion.liveObjectId')
            .addOrderBy('liveObjectVersion.createdAt', 'DESC')
            .getMany()
    } catch (err) {
        logger.error(`Error searching live objects: ${err}`)
        return { error: err?.message || err }
    }

    return {
        data: results.map(formatAsLatestLiveObject),
    }
}

function formatAsLatestLiveObject(liveObjectVersion: LiveObjectVersion): LatestLiveObject {
    const liveObject = (liveObjectVersion.liveObject || {}) as LiveObject
    return {
        id: liveObject.uid,
        name: liveObject.name,
        desc: liveObject.desc,
        latestVersion: {
            nsp: liveObjectVersion.nsp,
            name: liveObjectVersion.name,
            version: liveObjectVersion.version,
            properties: liveObjectVersion.properties,
            example: liveObjectVersion.example,
            config: liveObjectVersion.config || null,
            createdAt: liveObjectVersion.createdAt.toISOString(),        
        }
    }
}

export default searchLiveObjects