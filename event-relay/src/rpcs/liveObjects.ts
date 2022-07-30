import { getLiveObjectVersionsByNamespacedVersions, CoreDB, EventVersion, toNamespacedVersion, logger } from 'shared'

interface ResolveLiveObjectVersionsPayload {
    ids: string[]
}

export async function resolveLiveObjectVersions(request: any) {
    // Parse payload.
    const data = request.data as ResolveLiveObjectVersionsPayload

    // Get all live objects for the given array of versioned ids.
    const lovs = await getLiveObjectVersionsByNamespacedVersions(data.ids)
    const lovIds = lovs.map(lov => lov.id)

    // Get all event versions associated with these live object versions.
    let eventVersions = []
    try {
        eventVersions = await CoreDB.getRepository(EventVersion)
            .createQueryBuilder('eventVersion')
            .leftJoinAndSelect('eventVersion.liveEventVersions', 'liveEventVersion')
            .where('liveEventVersion.liveObjectVersionId IN (:...lovIds)', { lovIds })
            .getMany()
    } catch (err) {
        logger.error(
            `Error fetching EventVersions for liveObjectVersionIds: ${lovIds.join(', ')}: ${err}`
        )
        request.end([])
        return
    }

    // Map event versions to their associated live object version.
    const lovMap = {}
    for (const eventVersion of eventVersions) {
        for (const liveEventVersion of eventVersion.liveEventVersions) {
            const mapId = liveEventVersion.liveObjectVersionId
            if (!lovMap.hasOwnProperty(mapId)) {
                lovMap[mapId] = []
            }
            lovMap[mapId].push(eventVersion)    
        }
    }

    // Format clean and simple namespace-versioned response.
    const resp = []
    for (let lov of lovs) {
        resp.push({
            id: toNamespacedVersion(lov.nsp, lov.name, lov.version),
            events: (lovMap[lov.id] || []).map(ev => ({
                name: toNamespacedVersion(ev.nsp, ev.name, ev.version)
            }))
        })
    }
    request.end(resp)
}