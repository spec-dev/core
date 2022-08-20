import { 
    getLiveObjectVersionsByNamespacedVersions, 
    CoreDB, 
    EventVersion, 
    EdgeFunctionVersion, 
    toNamespacedVersion, 
    logger,
} from 'shared'

interface ResolveLiveObjectVersionsPayload {
    ids: string[]
}

export async function resolveLiveObjectVersions(request: any) {
    // Parse payload.
    const data = request.data as ResolveLiveObjectVersionsPayload

    // Get all live object versions for the given array of versioned ids.
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

    // Get all edge function versions associated with these live object versions.
    let edgeFunctionVersions = []
    try {
        edgeFunctionVersions = await CoreDB.getRepository(EdgeFunctionVersion)
            .createQueryBuilder('edgeFunctionVersion')
            .leftJoinAndSelect('edgeFunctionVersion.liveEdgeFunctionVersions', 'liveEdgeFunctionVersion')
            .where('liveEdgeFunctionVersion.liveObjectVersionId IN (:...lovIds)', { lovIds })
            .getMany()
    } catch (err) {
        logger.error(
            `Error fetching EdgeFunctionVersions for liveObjectVersionIds: ${lovIds.join(', ')}: ${err}`
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
            lovMap[liveObjectVersionId].events.push({
                name: toNamespacedVersion(eventVersion.nsp, eventVersion.name, eventVersion.version)
            })    
        }
    }
    for (const edgeFunctionVersion of edgeFunctionVersions) {
        for (const liveEdgeFunctionVersion of edgeFunctionVersion.liveEdgeFunctionVersions) {
            const liveObjectVersionId = liveEdgeFunctionVersion.liveObjectVersionId
            if (!lovMap.hasOwnProperty(liveObjectVersionId)) {
                lovMap[liveObjectVersionId] = { events: [], edgeFunctions: [] }
            }
            lovMap[liveObjectVersionId].edgeFunctions.push({
                name: toNamespacedVersion(edgeFunctionVersion.nsp, edgeFunctionVersion.name, edgeFunctionVersion.version),
                args: liveEdgeFunctionVersion.args || edgeFunctionVersion.args || {},
                argsMap: liveEdgeFunctionVersion.argsMap || {},
                metadata: liveEdgeFunctionVersion.metadata || {},
                role: liveEdgeFunctionVersion.role,
            })
        }
    }

    // Format clean and simple namespace-versioned response.
    const resp = []
    for (let lov of lovs) {
        resp.push({
            id: toNamespacedVersion(lov.nsp, lov.name, lov.version),
            events: (lovMap[lov.id] || {}).events || [],
            edgeFunctions: (lovMap[lov.id] || {}).edgeFunctions || [],
        })
    }
    request.end(resp)
}