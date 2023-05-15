import config from './config'
import chalk from 'chalk'
import fetch from 'cross-fetch'
import { camelizeKeys } from 'humps'
import { 
    canBlockBeOperatedOn, 
    logger, 
    sleep, 
    CoreDB, 
    unique, 
    StringKeyMap, 
    getBlockEvents, 
    fromNamespacedVersion, 
    uniqueByKeys, 
    toNamespacedVersion, 
    deleteBlockEvents, 
    deleteBlockCalls, 
    newTablesJWT,
    getFailingNamespaces,
    getFailingTables,
    getBlockCalls,
    updateLiveObjectVersionStatus,
    LiveObjectVersionStatus,
    SharedTables,
    schemaForChainId,
    identPath,
    toDate,
    markLovFailure,
    getLovFailure,
    publishEvents, 
    publishCalls,
    getDBTimestamp,
} from '../../shared'

/**
 *  TODO: Consolidate logic between contract calls and events.
 */
async function perform(data: StringKeyMap) {
    const blockNumber = Number(data.blockNumber)

    // Ensure re-org hasn't occurred that would affect progress.
    if (!(await canBlockBeOperatedOn(config.CHAIN_ID, blockNumber))) {
        logger.notify(chalk.yellow(`[${blockNumber}] Reorg was detected. Stopping.`))
        return
    }

    console.log('')
    logger.info(`Generating calls & events for block ${blockNumber}...`)

    // Get the calls & events for this block number from redis.
    let [blockCalls, blockEvents] = await Promise.all([
        getBlockCalls(config.CHAIN_ID, blockNumber),
        getBlockEvents(config.CHAIN_ID, blockNumber),
    ])
    if (!blockCalls?.length && !blockEvents?.length) {
        logger.warn(`No calls or events originated in block ${blockNumber}.`)
        return
    }

    // Format/sort the calls & events.
    const contractCalls = sortContractCalls(blockCalls)
    const originEvents = formatOriginEvents(blockEvents)

    // Publish all calls & origin events up-front.
    const hasContractCalls = contractCalls.length > 0
    const hasOriginEvents = originEvents.length > 0
    const eventTimestamp = (hasContractCalls || hasOriginEvents) ? await getDBTimestamp() : null
    hasContractCalls && await publishContractCalls(contractCalls, blockNumber, eventTimestamp)
    hasOriginEvents && await publishOriginEvents(originEvents, blockNumber, eventTimestamp)

    // Get the unique contract call names and unique event names for this batch.
    const uniqueContractCallComps = getUniqueContractCallComps(contractCalls)
    const uniqueEventVersionComps = getUniqueEventVersionComps(originEvents)

    // Get the failing namespaces and tables to avoid generating events for.
    const [cachedFailingNsps, cachedFailingTables] = await Promise.all([
        getFailingNamespaces(config.CHAIN_ID),
        getFailingTables(config.CHAIN_ID),
    ])
    const failingNamespaces = new Set(cachedFailingNsps)
    const failingTables = new Set(cachedFailingTables)

    // Map the contract calls and event versions to the 
    // live object versions that depend on them as inputs.
    const [inputContractCallsToLovs, inputEventVersionsToLovs] = await Promise.all([
        getLiveObjectVersionToContractCallMappings(
            uniqueContractCallComps,
            failingNamespaces,
            failingTables,
            blockNumber,
        ),
        getLiveObjectVersionToEventVersionMappings(
            uniqueEventVersionComps,
            failingNamespaces,
            failingTables,
            blockNumber,
        ),
    ])

    const pluckLovIds = (toLovsMap: StringKeyMap) => Object.values(toLovsMap)
        .map(entries => (entries || []).map(entry => entry.lovId).filter(v => !!v)).flat()

    const uniqueLovIds = unique([
        ...pluckLovIds(inputContractCallsToLovs),
        ...pluckLovIds(inputEventVersionsToLovs),
    ])

    // Map live object versions to the event versions they are allowed to generate (i.e. outputs).
    const generatedEventVersionResults = await getGeneratedEventVersionsForLovs(
        uniqueLovIds,
        blockNumber,
    )
    const generatedEventVersionsWhitelist = {}
    for (const { nsp, name, version, lovId } of generatedEventVersionResults) {
        const numericLovId = Number(lovId)
        if (!generatedEventVersionsWhitelist.hasOwnProperty(numericLovId)) {
            generatedEventVersionsWhitelist[numericLovId] = new Set()
        }
        generatedEventVersionsWhitelist[numericLovId].add(toNamespacedVersion(nsp, name, version))
    }

    // Group origin events by live object version namespace. Then within each namespace, 
    // group the events even further if their adjacent events share the same live object version.
    const callGroups = groupCallsByLovNamespace(contractCalls, inputContractCallsToLovs)
    const eventGroups = groupEventsByLovNamespace(originEvents, inputEventVersionsToLovs )

    // Merge call groups and event groups by live object version namespace.
    const seenLovNsps = new Set<string>()
    const inputGroups = {}
    for (const lovNsp in eventGroups) {
        const eventEntries = eventGroups[lovNsp] || []
        const callEntries = callGroups[lovNsp] || []
        inputGroups[lovNsp] = [...callEntries, ...eventEntries]
        seenLovNsps.add(lovNsp)
    }
    for (const lovNsp in callGroups) {
        if (seenLovNsps.has(lovNsp)) continue
        inputGroups[lovNsp] = callGroups[lovNsp] || []
    }

    // One last check before event generation.
    if (!(await canBlockBeOperatedOn(config.CHAIN_ID, blockNumber))) {
        logger.notify(chalk.yellow(`[${blockNumber}] Reorg was detected. Stopping pre-event-gen.`))
        return
    }

    // Generate Live Object events for each namespace group in parallel.
    const promises = []
    const failedLovIds = new Set<number>()
    for (const lovNsp in inputGroups) {
        promises.push(generateLiveObjectEventsForNamespace(
            lovNsp,
            inputGroups[lovNsp],
            generatedEventVersionsWhitelist,
            failedLovIds,
            blockNumber,
        ))
    }
    await Promise.all(promises)

    // One last check before deleting calls/events from cache.
    if (!(await canBlockBeOperatedOn(config.CHAIN_ID, blockNumber))) {
        logger.notify(chalk.yellow(`[${blockNumber}] Reorg was detected. Stopping pre-cache-clear.`))
        return
    }    

    await Promise.all([
        deleteBlockCalls(config.CHAIN_ID, blockNumber),
        deleteBlockEvents(config.CHAIN_ID, blockNumber),
    ])
}

function formatOriginEvents(blockEvents: StringKeyMap[]): StringKeyMap[] {
    const customOriginEvents = []
    const contractEvents = []
    for (const event of (blockEvents || [])) {
        const isContractEvent = (
            event.origin.hasOwnProperty('transactionIndex') || 
            event.origin.hasOwnProperty('logIndex')
        )
        isContractEvent ? contractEvents.push(event) : customOriginEvents.push(event)
    }
    return [
        ...customOriginEvents, 
        ...sortContractEvents(contractEvents),
    ]
}

async function publishOriginEvents(
    entries: StringKeyMap[],
    blockNumber: number,
    eventTimestamp: string,
) {
    try {
        await publishEvents(entries, false, eventTimestamp)
    } catch (err) {
        throw `Failed to publish origin events for block ${blockNumber}: ${err}`
    }
}

async function publishContractCalls(
    entries: StringKeyMap[],
    blockNumber: number,
    eventTimestamp: string,
) {
    try {
        await publishCalls(entries, eventTimestamp)
    } catch (err) {
        throw `Failed to publish contract calls for block ${blockNumber}: ${err}`
    }
}

async function generateLiveObjectEventsForNamespace(
    nsp: string,
    inputGroups: StringKeyMap[],
    generatedEventVersionsWhitelist: StringKeyMap,
    failedLovIds: Set<number>,
    blockNumber: number,
) {
    const tablesApiTokens = {}

    const lovIds = []
    const generatedEvents = []
    for (const inputGroup of inputGroups) {
        const { lovId, lovUrl, lovTableSchema, events, calls } = inputGroup
        lovIds.push(lovId)

        if (failedLovIds.has(lovId)) {
            generatedEvents.push([])
            continue
        }

        const inputs = calls || events

        // Create JWT for event generator to use when querying our tables api.
        if (!tablesApiTokens[lovTableSchema]) {
            tablesApiTokens[lovTableSchema] = newTablesApiToken(lovTableSchema)
        }

        generatedEvents.push(await generateLiveObjectEventsWithProtection(
            nsp,
            lovId,
            lovUrl,
            generatedEventVersionsWhitelist[lovId],
            failedLovIds,
            inputs,
            tablesApiTokens[lovTableSchema],
            blockNumber,
        ))
    }

    const eventsToPublish = []
    for (let i = 0; i < lovIds.length; i++) {
        const lovId = lovIds[i]
        if (failedLovIds.has(lovId)) continue
        eventsToPublish.push(...generatedEvents[i])
    }
    if (!eventsToPublish.length) return

    // Check before publishing.
    if (!(await canBlockBeOperatedOn(config.CHAIN_ID, blockNumber))) {
        logger.notify(chalk.yellow(`[${blockNumber}] Reorg was detected. Stopping.`))
        return
    }

    // Publish generated events on-the-fly as they come back.
    try {
        await publishEvents(eventsToPublish, true)
    } catch (err) {
        throw `[${blockNumber}] Publishing events for namespace ${nsp} failed: ${err}`
    }
}

export async function generateLiveObjectEventsWithProtection(
    lovNsp: string,
    lovId: number,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    failedLovIds: Set<number>,
    inputs: StringKeyMap[],
    tablesApiToken: string,
    blockNumber: number,
): Promise<StringKeyMap[]> {
    try {
        const eventsQueue = []
        return await generateLiveObjectEvents(
            lovNsp,
            lovId,
            lovUrl,
            acceptedOutputEvents,
            inputs,
            tablesApiToken,
            blockNumber,
            eventsQueue,
            inputs,
        )
    } catch (err) {
        logger.error(
            `[${blockNumber}]: Generating events failed (lovId=${lovId}) 
            for inputs: ${JSON.stringify(inputs, null, 4)}`, err,
        )
        await updateLiveObjectVersionStatus(lovId, LiveObjectVersionStatus.Failing)
        const blockTimestamp = await getBlockTimestamp(blockNumber)
        blockTimestamp && await markLovFailure(lovId, blockTimestamp)
        failedLovIds.add(lovId)
        return []
    }
}   

async function generateLiveObjectEvents(
    lovNsp: string,
    lovId: number,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    inputs: StringKeyMap[],
    tablesApiToken: string,
    blockNumber: number,
    eventsQueue: StringKeyMap[],
    allInputs: StringKeyMap[],
    attempts: number = 0,
): Promise<StringKeyMap[]> {
    // Prep both auth headers. One for the event generator function itself, 
    // and one for the event generator to make calls to the Tables API.
    const headers = {
        [config.EVENT_GEN_AUTH_HEADER_NAME]: config.EVENT_GENERATORS_JWT,
        [config.TABLES_AUTH_HEADER_NAME]: tablesApiToken,
    }

    // Forced timeout at 60s.
    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), config.EVENT_GEN_RESPONSE_TIMEOUT)

    // Call event generator function.
    let resp
    try {
        resp = await fetch(lovUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(inputs),
            signal: abortController.signal,
        })
    } catch (err) {
        clearTimeout(timer)
        const error = `[${blockNumber}] Request error to ${lovUrl} (lovId=${lovId}): ${err}. Attempt ${attempts}/${10}`
        logger.error(error)
        if (attempts <= 50) {
            await sleep(1000)
            return generateLiveObjectEvents(
                lovNsp,
                lovId,
                lovUrl,
                acceptedOutputEvents,
                inputs,
                tablesApiToken,
                blockNumber,
                eventsQueue,
                allInputs,
                attempts + 1,
            )
        } else {
            throw err
        }
    }
    clearTimeout(timer)

    // Get the live object events generated from the response.
    let generatedEventGroups = []
    try {
        generatedEventGroups = (await resp?.json()) || []
    } catch (err) {
        logger.error(
            `[${blockNumber}] Failed to parse JSON response (lovId=${lovId}): ${err} - 
            inputs: ${JSON.stringify(inputs, null, 4)}`
        )
    }
    if (resp?.status !== 200) {
        const msg = (
            `[${blockNumber}] Request to ${lovUrl} (lovId=${lovId}) failed with status ${resp?.status}: 
            ${JSON.stringify(generatedEventGroups || {})}.`
        )
        logger.error(msg)
        if (attempts <= 50) {
            await sleep(1000)
            const respData = generatedEventGroups as StringKeyMap

            let retryInputs = inputs
            let successfullyPublishedEvents = []
            if (resp.status == 500 && respData && respData.hasOwnProperty('index')) {
                retryInputs = retryInputs.slice(Number(respData.index))
                successfullyPublishedEvents = respData.publishedEvents || []
            }
            eventsQueue.push(...successfullyPublishedEvents)

            return generateLiveObjectEvents(
                lovNsp,
                lovId,
                lovUrl,
                acceptedOutputEvents,
                retryInputs,
                tablesApiToken,
                blockNumber,
                eventsQueue,
                allInputs,
                attempts + 1,
            )
        } else {
            throw msg
        }
    }

    generatedEventGroups = [...eventsQueue, ...generatedEventGroups]

    // Filter generated events by those that are allowed to be created / registered with Spec.
    acceptedOutputEvents = acceptedOutputEvents || new Set()
    const liveObjectEvents = []
    let i = 0
    for (const generatedEvents of generatedEventGroups) {
        const input = allInputs[i]
        if (!input) {
            logger.error(`[${blockNumber}] Failed to match input against generated events for index ${i} (lovId=${lovId})`)
            continue
        }
        
        for (const event of generatedEvents) {
            const { nsp: eventNsp } = fromNamespacedVersion(event.name)
            if (!acceptedOutputEvents.has(event.name) && eventNsp !== lovNsp) {
                logger.error(`[${blockNumber}] Live object (lovId=${lovId}) is not allowed to generate event: ${event.name}`)
                continue
            }

            if (!Object.keys(event.data || {}).length) {
                logger.error(`[${blockNumber}] Received empty generated event for input ${JSON.stringify(input, null, 4)}`)
                continue
            }

            const liveObjectEvent = {
                ...event,
                origin: input.origin,
            }

            liveObjectEvents.push(liveObjectEvent)
        }
        i++
    }
    return liveObjectEvents
}

function groupCallsByLovNamespace(
    calls: StringKeyMap[], 
    inputContractCallsToLovs: StringKeyMap,
): StringKeyMap {
    const callsByLovNsp = {}
    for (const call of calls) {
        const lovsDependentOnCall = inputContractCallsToLovs[call.name]
        if (!lovsDependentOnCall?.length) continue

        for (const { lovNsp, lovId, lovUrl, lovTableSchema } of lovsDependentOnCall) {
            if (!callsByLovNsp.hasOwnProperty(lovNsp)) {
                callsByLovNsp[lovNsp] = []
            }
            callsByLovNsp[lovNsp].push({ 
                lovNsp,
                lovId,
                lovUrl,
                lovTableSchema,
                call,
            })
        }
    }

    const callsByNamespaceAndLov = {}
    for (const nsp in callsByLovNsp) {
        const groupedByLov = []
        let adjacentCallsWithSameLov = []
        let prevLovId = null
        let lovId, prevLovUrl, prevLovTableSchema

        for (const entry of callsByLovNsp[nsp]) {
            const { call } = entry
            lovId = entry.lovId

            if (prevLovId === null) {
                adjacentCallsWithSameLov = [call]
                prevLovId = lovId
                prevLovUrl = entry.lovUrl
                prevLovTableSchema = entry.lovTableSchema    
                continue
            }

            if (lovId !== prevLovId) {
                groupedByLov.push({
                    lovId: prevLovId,
                    lovUrl: prevLovUrl,
                    lovTableSchema: prevLovTableSchema,
                    events: adjacentCallsWithSameLov,
                })
                adjacentCallsWithSameLov = [call]
                prevLovId = lovId
                prevLovUrl = entry.lovUrl
                prevLovTableSchema = entry.lovTableSchema
                continue
            }

            adjacentCallsWithSameLov.push(call)
        }
        adjacentCallsWithSameLov.length && groupedByLov.push({
            lovId: prevLovId,
            lovUrl: prevLovUrl,
            lovTableSchema: prevLovTableSchema,
            calls: adjacentCallsWithSameLov,
        })
        callsByNamespaceAndLov[nsp] = groupedByLov
    }

    return callsByNamespaceAndLov
}

function groupEventsByLovNamespace(
    events: StringKeyMap[], 
    inputEventVersionsToLovs: StringKeyMap,
): StringKeyMap {
    const eventsByLovNsp = {}
    for (const event of events) {
        const lovsDependentOnEventVersion = inputEventVersionsToLovs[event.name]
        if (!lovsDependentOnEventVersion?.length) continue

        for (const { lovNsp, lovId, lovUrl, lovTableSchema } of lovsDependentOnEventVersion) {
            if (!eventsByLovNsp.hasOwnProperty(lovNsp)) {
                eventsByLovNsp[lovNsp] = []
            }
            eventsByLovNsp[lovNsp].push({ 
                lovNsp,
                lovId,
                lovUrl,
                lovTableSchema,
                event,
            })
        }
    }

    const eventsByNamespaceAndLov = {}
    for (const nsp in eventsByLovNsp) {
        const groupedByLov = []
        let adjacentEventsWithSameLov = []
        let prevLovId = null
        let lovId, prevLovUrl, prevLovTableSchema

        for (const entry of eventsByLovNsp[nsp]) {
            const { event } = entry
            lovId = entry.lovId

            if (prevLovId === null) {
                adjacentEventsWithSameLov = [event]
                prevLovId = lovId
                prevLovUrl = entry.lovUrl
                prevLovTableSchema = entry.lovTableSchema    
                continue
            }

            if (lovId !== prevLovId) {
                groupedByLov.push({
                    lovId: prevLovId,
                    lovUrl: prevLovUrl,
                    lovTableSchema: prevLovTableSchema,
                    events: adjacentEventsWithSameLov,
                })
                adjacentEventsWithSameLov = [event]
                prevLovId = lovId
                prevLovUrl = entry.lovUrl
                prevLovTableSchema = entry.lovTableSchema
                continue
            }

            adjacentEventsWithSameLov.push(event)
        }
        adjacentEventsWithSameLov.length && groupedByLov.push({
            lovId: prevLovId,
            lovUrl: prevLovUrl,
            lovTableSchema: prevLovTableSchema,
            events: adjacentEventsWithSameLov,
        })
        eventsByNamespaceAndLov[nsp] = groupedByLov
    }

    return eventsByNamespaceAndLov
}

async function getLiveObjectVersionToContractCallMappings(
    contractCallComps: StringKeyMap[],
    failingNamespaces: Set<string>,
    failingTables: Set<string>,
    blockNumber: number,
): Promise<StringKeyMap> {
    const lovResults = await getLiveObjectVersionsThroughLiveCallHandlers(
        contractCallComps,
        blockNumber,
    )

    // Map contract calls to the live object versions that depend on them.
    const inputContractCallsToLovs = {}
    for (const result of lovResults) {
        const { nsp, functionName, lovNsp, lovId, lovUrl, lovTablePath } = result
        if (failingNamespaces.has(nsp) || failingTables.has(lovTablePath)) continue
        const callName = [nsp, functionName].join('.')
        if (!inputContractCallsToLovs.hasOwnProperty(callName)) {
            inputContractCallsToLovs[callName] = []
        }
        inputContractCallsToLovs[callName].push({
            lovNsp,
            lovId: Number(lovId),
            lovUrl,
            lovTableSchema: lovTablePath.split('.')[0],
            lovTablePath,
        })
    }
    return inputContractCallsToLovs
}

async function getLiveObjectVersionToEventVersionMappings(
    eventVersionComps: StringKeyMap[],
    failingNamespaces: Set<string>,
    failingTables: Set<string>,
    blockNumber: number,
): Promise<StringKeyMap> {
    const lovResults = await getLiveObjectVersionsFromInputLiveEventVersions(
        eventVersionComps,
        blockNumber,
    )

    // Map event versions to the live object versions that depend on them.
    const inputEventVersionsToLovs = {}
    for (const result of lovResults) {
        const { nsp, name, version, lovNsp, lovId, lovUrl, lovTablePath } = result
        if (failingNamespaces.has(nsp) || failingTables.has(lovTablePath)) continue
        const eventVersion = toNamespacedVersion(nsp, name, version)
        if (!inputEventVersionsToLovs.hasOwnProperty(eventVersion)) {
            inputEventVersionsToLovs[eventVersion] = []
        }
        inputEventVersionsToLovs[eventVersion].push({
            lovNsp,
            lovId: Number(lovId),
            lovUrl,
            lovTableSchema: lovTablePath.split('.')[0],
            lovTablePath,
        })
    }
    return inputEventVersionsToLovs
}

async function getLiveObjectVersionsFromInputLiveEventVersions(
    eventVersionComps: StringKeyMap[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
    if (!eventVersionComps.length) return []
    const andClauses = []
    const bindings = []

    let i = 1
    for (const { nsp, name, version } of eventVersionComps) {
        andClauses.push(`(event_versions.nsp = $${i} and event_versions.name = $${i + 1} and event_versions.version = $${i + 2})`)
        bindings.push(...[nsp, name, version])
        i += 3
    }
    const sql = `select
event_versions.nsp as nsp,
event_versions.name as name,
event_versions.version as version,
live_object_versions.nsp as lov_nsp,
live_object_versions.id as lov_id,
live_object_versions.url as lov_url,
live_object_versions.status as lov_status,
live_object_versions.config -> 'table' as lov_table_path
from live_event_versions
join event_versions on live_event_versions.event_version_id = event_versions.id
join live_object_versions on live_event_versions.live_object_version_id = live_object_versions.id
where (${andClauses.join(' or ')})
and live_event_versions.is_input = true
and live_object_versions.url is not null`

    return getLiveObjectVersionResults(sql, bindings, blockNumber)
}

async function getLiveObjectVersionsThroughLiveCallHandlers(
    contractCallComps: StringKeyMap[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
    if (!contractCallComps.length) return []
    const andClauses = []
    const bindings = []

    let i = 1
    for (const { nsp, functionName } of contractCallComps) {
        andClauses.push(`(namespaces.name = $${i} and live_call_handlers.function_name = $${i + 1})`)
        bindings.push(...[nsp, functionName])
        i += 2
    }

    const sql = `select
namespaces.name as nsp,
live_call_handlers.function_name as function_name,
live_object_versions.nsp as lov_nsp,
live_object_versions.id as lov_id,
live_object_versions.url as lov_url,
live_object_versions.status as lov_status,
live_object_versions.config -> 'table' as lov_table_path
from live_call_handlers
join namespaces on live_call_handlers.namespace_id = namespaces.id
join live_object_versions on live_call_handlers.live_object_version_id = live_object_versions.id
where (${andClauses.join(' or ')})
and live_object_versions.url is not null`

    return getLiveObjectVersionResults(sql, bindings, blockNumber)
}

async function getGeneratedEventVersionsForLovs(
    lovIds: number[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
    if (!lovIds?.length) return []
    const placeholders = []
    const bindings = []
    let i = 1
    for (const lovId of lovIds) {
        placeholders.push(`$${i}`)
        bindings.push(lovId)
        i++
    }

    // Get all non-input event versions that are allowed to be output by each of these live objects.
    const sql = `select
event_versions.nsp as nsp,
event_versions.name as name,
event_versions.version as version,
live_object_versions.id as lov_id
from live_event_versions
join event_versions on live_event_versions.event_version_id = event_versions.id
join live_object_versions on live_event_versions.live_object_version_id = live_object_versions.id
where live_object_versions.id in (${placeholders.join(', ')}) and live_event_versions.is_input is not true`

    let results = []
    try {
        results = (await CoreDB.query(sql, bindings)) || []
    } catch (err) {
        throw `[${blockNumber}] Error finding event versions from live object versions: ${err}`
    }
    return camelizeKeys(results)
}

async function getLiveObjectVersionResults(
    query: string,
    bindings: any[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
    let results = []
    try {
        results = (await CoreDB.query(query, bindings)) || []
    } catch (err) {
        throw `[${blockNumber}] Error finding live object versions: ${err}`
    }
    results = camelizeKeys(results)
    
    const usableResults = []
    const failing = []
    for (const result of results) {
        switch (result.lovStatus?.toString()) {
            case LiveObjectVersionStatus.Live.toString():
                usableResults.push(result)
                break
            case LiveObjectVersionStatus.Indexing.toString():
                break
            case LiveObjectVersionStatus.Failing.toString():
                failing.push(result)
                break
        }
    }

    if (!failing.length) return usableResults

    logger.info(chalk.yellow(
        `Not generating events for failing lovIds: ${failing.map(r => r.lovId).join(', ')}`
    ))

    const failedAtTimestamps = await Promise.all(failing.map(r => getLovFailure(r.lovId)))
    const dateToGenerateEventsFor = toDate(await getBlockTimestamp(blockNumber))
    for (let i = 0; i < failedAtTimestamps.length; i++) {
        const failedAtTimestamp = failedAtTimestamps[i]
        const failedAtDate = failedAtTimestamp ? toDate(failedAtTimestamp) : null
        if (dateToGenerateEventsFor && failedAtDate && dateToGenerateEventsFor < failedAtDate) {
            const resultThatMadeCutoff = failing[i]
            usableResults.push(resultThatMadeCutoff)
            logger.info(
                `Result for lovId ${resultThatMadeCutoff.lovId} made the cutoff before 
                failure: ${failedAtDate} vs. ${dateToGenerateEventsFor}`
            )
        }
    }

    return usableResults
}

async function getBlockTimestamp(blockNumber: number): Promise<string | null> {
    const schema = schemaForChainId[config.CHAIN_ID]
    const tablePath = [schema, 'blocks'].join('.')
    try {
        return (((await SharedTables.query(
            `select timestamp from ${identPath(tablePath)} where number = $1`, 
            [blockNumber]
        )) || [])[0] || {}).timestamp || null
    } catch (err) {
        logger.error(err)
        return null
    }
}

function sortContractEvents(contractEvents: StringKeyMap[]): StringKeyMap[] {
    return (contractEvents || []).sort((a, b) => (
        (a.transactionIndex - b.transactionIndex) || 
        (Number(a.logIndex) - Number(b.logIndex))
    ))
}

function sortContractCalls(contractCalls: StringKeyMap[]): StringKeyMap[] {
    return (contractCalls || []).sort((a, b) => (
        (a.transactionIndex - b.transactionIndex) || 
        (Number(a.traceIndex) - Number(b.traceIndex))
    ))
}

function getUniqueEventVersionComps(originEvents: StringKeyMap[]): StringKeyMap[] {
    return uniqueByKeys(
        originEvents
            .map(e => fromNamespacedVersion(e.name))
            .filter(e => !!e.nsp && !!e.name && !!e.version),
        ['nsp', 'name', 'version']
    )
}

function getUniqueContractCallComps(contractCalls: StringKeyMap[]): StringKeyMap[] {
    return uniqueByKeys(
        contractCalls.map(call => {
            const splitCallName = call.name.split('.')
            const functionName = splitCallName.pop()
            return { nsp: splitCallName.join('.'), functionName }
        }),
        ['nsp', 'functionName']
    )
}

function newTablesApiToken(schema: string) {
    return newTablesJWT(schema, config.EVENT_GEN_RESPONSE_TIMEOUT * 100)
}

export default perform