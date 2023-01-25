import { StringKeyMap, LatestLiveObject } from '../types'
import { buildIconUrl, CoreDB, LiveObjectVersion, logger, isContractNamespace } from '../../../shared'
import path from 'path'

async function searchLiveObjects(query?: StringKeyMap): Promise<StringKeyMap> {
    // TODO: Actually implement search functionality using the latest versions of each live object cached in redis.
    // HACK: Right now just return all live objects with their current version.
    let results
    try {
        results = await CoreDB.getRepository(LiveObjectVersion)
            .createQueryBuilder('liveObjectVersion')
            .distinctOn(['liveObjectVersion.liveObjectId'])
            .leftJoinAndSelect('liveObjectVersion.liveObject', 'liveObject')
            .leftJoinAndSelect('liveObject.namespace', 'namespace')
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
    const liveObject = liveObjectVersion.liveObject
    const config = liveObjectVersion.config
    const namespace = liveObject.namespace
    const isContractEvent = isContractNamespace(namespace.name)

    let icon
    if (liveObject.hasIcon) {
        icon = buildIconUrl(liveObject.uid)
    } else if (namespace.hasIcon) {
        icon = buildIconUrl(namespace.name)
    } else if (isContractEvent) {
        icon = buildIconUrl(namespace.name.split('.')[2])
    } else {
        icon = '' // TODO: Need fallback
    }

    let codeUrl = null
    if (!isContractEvent && namespace.codeUrl && !!(config?.folder)) {
        codeUrl = path.join(namespace.codeUrl, 'tree', 'master', config.folder)
    }

    return {
        id: liveObject.uid,
        name: liveObject.name,
        displayName: liveObject.displayName,
        desc: liveObject.desc,
        icon,
        codeUrl,
        isContractEvent,
        latestVersion: {
            nsp: liveObjectVersion.nsp,
            name: liveObjectVersion.name,
            version: liveObjectVersion.version,
            properties: liveObjectVersion.properties,
            example: liveObjectVersion.example,
            config: config,
            createdAt: liveObjectVersion.createdAt.toISOString(),        
        }
    }
}

export default searchLiveObjects