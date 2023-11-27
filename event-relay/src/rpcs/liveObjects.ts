import { 
    getLiveObjectVersionsByNamespacedVersions, 
    CoreDB, 
    EventVersion, 
    toNamespacedVersion, 
    logger,
} from '../../../shared'

interface ResolveLiveObjectVersionsPayload {
    ids: string[]
}

export async function resolveLiveObjectVersions(request: any) {
    // Get all live object versions for the given array of versioned ids.
    const data = request.data as ResolveLiveObjectVersionsPayload
    const lovs = await getLiveObjectVersionsByNamespacedVersions(data.ids)
    const lovIds = lovs.map(lov => lov.id)

    // Get all event versions associated with these live object versions.
    let eventVersions = []
    try {
        eventVersions = lovIds.length ? (await CoreDB.getRepository(EventVersion)
            .createQueryBuilder('eventVersion')
            .leftJoinAndSelect('eventVersion.liveEventVersions', 'liveEventVersion')
            .where('liveEventVersion.liveObjectVersionId IN (:...lovIds)', { lovIds })
            .andWhere('liveEventVersion.isInput is not true')
            .getMany()) : []
    } catch (err) {
        logger.error(
            `Error fetching EventVersions for liveObjectVersionIds: ${lovIds.join(', ')}: ${err}`
        )
        request.end([])
        return
    }

    // Group everything by live object version.
    const lovMap = {}
    for (const eventVersion of eventVersions) {
        for (const liveEventVersion of eventVersion.liveEventVersions) {
            const liveObjectVersionId = liveEventVersion.liveObjectVersionId
            if (!lovMap.hasOwnProperty(liveObjectVersionId)) {
                lovMap[liveObjectVersionId] = { events: [], edgeFunctions: [] }
            }
            const eventName = toNamespacedVersion(eventVersion.nsp, eventVersion.name, eventVersion.version)
            lovMap[liveObjectVersionId].events.push({ name: eventName })
        }
    }

    // Format clean and simple namespace-versioned response.
    const resp = []
    for (let lov of lovs) {
        resp.push({
            id: toNamespacedVersion(lov.nsp, lov.name, lov.version),
            events: (lovMap[lov.id] || {}).events || [],
            edgeFunctions: [], // Legacy (keep for now)
            config: lov.config || {},
        })
    }
    request.end(resp)
}

export async function getLiveObjectChainIds(request: any) {
    const data = request.data as ResolveLiveObjectVersionsPayload
    const lovs = await getLiveObjectVersionsByNamespacedVersions(data.ids)

    const lovChainIds = {}
    for (const lov of lovs) {
        const chainIds = Object.keys(lov.config?.chains || {})
        const id = toNamespacedVersion(lov.nsp, lov.name, lov.version)
        lovChainIds[id] = chainIds
    }

    request.end(lovChainIds)
}