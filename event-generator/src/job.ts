import { logger, sleep, CoreDB, unique, StringKeyMap, getBlockEvents, fromNamespacedVersion, uniqueByKeys, toNamespacedVersion, deleteBlockEvents, deleteBlockCalls, getSkippedBlocks, newTablesJWT, getFailingNamespaces, getBlockCalls } from '../../shared'
import config from './config'
import { publishEvents, publishCalls, getDBTimestamp } from './relay'
import { camelizeKeys } from 'humps'
import fetch from 'cross-fetch'

/**
 *  TODO: Consolidate logic between contract calls and events.
 */
async function perform(data: StringKeyMap) {
    const blockNumber = Number(data.blockNumber)
    const skipped = data.skipped || false
    const replay = data.replay || false

    logger.info(`\nGenerating calls & events for block ${blockNumber}...`)

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
    const contractCalls = formatContractCalls(blockCalls, skipped, replay)
    const originEvents = formatOriginEvents(blockEvents, skipped, replay)

    console.log(`[${blockNumber}]: Events (${originEvents.length}) | Calls (${contractCalls.length})`)
    return

    // Publish all calls & origin events up-front.
    const hasContractCalls = contractCalls.length > 0
    const hasOriginEvents = originEvents.length > 0
    const eventTimestamp = (hasContractCalls || hasOriginEvents) ? await getDBTimestamp() : null
    hasContractCalls && await publishContractCalls(contractCalls, blockNumber, eventTimestamp)
    hasOriginEvents && await publishOriginEvents(originEvents, blockNumber, eventTimestamp)

    // Get the unique contract call names and unique event names for this batch.
    const uniqueContractCallComps = getUniqueContractCallComps(contractCalls)
    const uniqueEventVersionComps = getUniqueEventVersionComps(originEvents)

    // Map the contract calls and event versions to the 
    // live object versions that depend on them as inputs.
    const [inputContractCallsToLovs, inputEventVersionsToLovs] = await Promise.all([
        getLiveObjectVersionToContractCallMappings(uniqueContractCallComps, blockNumber),
        getLiveObjectVersionToEventVersionMappings(uniqueEventVersionComps, blockNumber),
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

    // Get the failing namespaces to avoid generating Spec events for.
    const failingNamespaces = new Set(await getFailingNamespaces(config.CHAIN_ID))

    // Group origin events by live object version namespace. Then within each namespace, 
    // group the events even further if their adjacent events share the same live object version.
    const callGroups = groupCallsByLovNamespace(
        contractCalls,
        inputContractCallsToLovs,
        failingNamespaces,
    )
    const eventGroups = groupEventsByLovNamespace(
        originEvents,
        inputEventVersionsToLovs,
        failingNamespaces,
    )

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

    // Generate Live Object events for each namespace group in parallel.
    const promises = []
    for (const lovNsp in inputGroups) {
        promises.push(generateLiveObjectEventsForNamespace(
            lovNsp,
            inputGroups[lovNsp],
            generatedEventVersionsWhitelist,
            blockNumber,
        ))
    }
    await Promise.all(promises)

    // If any blocks have been skipped, keep the block calls & events in redis. 
    // Otherwise, they can safely be removed.
    const skippedBlocks = await getSkippedBlocks(config.CHAIN_ID)
    if (skippedBlocks?.length) return
    await Promise.all([
        deleteBlockCalls(config.CHAIN_ID, blockNumber),
        deleteBlockEvents(config.CHAIN_ID, blockNumber),
    ])
}

function formatOriginEvents(blockEvents: StringKeyMap[], skipped: boolean, replay: boolean): StringKeyMap[] {
    const customOriginEvents = []
    const contractEvents = []
    for (const event of (blockEvents || [])) {
        if (skipped) {
            event.origin.skipped = skipped
        }
        if (replay) {
            event.origin.replay = replay
        }
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

function formatContractCalls(blockCalls: StringKeyMap[], skipped: boolean, replay: boolean): StringKeyMap[] {
    const contractCalls = []
    for (const call of (blockCalls || [])) {
        if (skipped) {
            call.origin.skipped = skipped
        }
        if (replay) {
            call.origin.replay = replay
        }
        contractCalls.push(call)
    }
    return sortContractCalls(contractCalls)
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
    blockNumber: number,
) {
    const tablesApiTokens = {}

    for (const inputGroup of inputGroups) {
        const { lovId, lovUrl, lovTableSchema, events, calls } = inputGroup
        const inputs = calls || events

        // Create JWT for event generator to use when querying our tables api.
        if (!tablesApiTokens[lovTableSchema]) {
            tablesApiTokens[lovTableSchema] = newTablesApiToken(lovTableSchema)
        }

        const generatedEvents = await generateLiveObjectEventsWithProtection(
            nsp,
            lovId,
            lovUrl,
            generatedEventVersionsWhitelist[lovId],
            inputs,
            tablesApiTokens[lovTableSchema],
            blockNumber,
        )
        if (!generatedEvents?.length) continue

        // Publish generated events on-the-fly as they come back.
        try {
            await publishEvents(generatedEvents, true)
        } catch (err) {
            throw `[${blockNumber}] Publishing events for namespace ${nsp} failed: ${err}`
        }
    }
}

export async function generateLiveObjectEventsWithProtection(
    lovNsp: string,
    lovId: number,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    inputs: StringKeyMap[],
    tablesApiToken: string,
    blockNumber: number,
): Promise<StringKeyMap[] | null> {
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
        logger.error(`[${blockNumber}]: Generating events failed (lovId=${lovId}) for inputs: ${JSON.stringify(inputs, null, 4)}`, err)
        return null
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
        const error = `[${blockNumber}] Request error to ${lovUrl} (lovId=${lovId}): ${err}`
        logger.error(error)
        if (attempts <= 10) {
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
        logger.error(`[${blockNumber}] Failed to parse JSON response (lovId=${lovId}): ${err} - inputs: ${JSON.stringify(inputs, null, 4)}`)
    }
    if (resp?.status !== 200) {
        const msg = `[${blockNumber}] Request to ${lovUrl} (lovId=${lovId}) failed with status ${resp?.status}: ${JSON.stringify(generatedEventGroups || {})}.`
        logger.error(msg)
        if (attempts <= 10) {
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
    failingNamespaces: Set<string>,
): StringKeyMap {
    const callsByLovNsp = {}
    for (const call of calls) {
        const lovsDependentOnCall = inputContractCallsToLovs[call.name]
        if (!lovsDependentOnCall?.length) continue

        for (const { lovNsp, lovId, lovUrl, lovTableSchema } of lovsDependentOnCall) {
            if (failingNamespaces.has(lovNsp)) continue
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
    failingNamespaces: Set<string>,
): StringKeyMap {
    const eventsByLovNsp = {}
    for (const event of events) {
        const lovsDependentOnEventVersion = inputEventVersionsToLovs[event.name]
        if (!lovsDependentOnEventVersion?.length) continue

        for (const { lovNsp, lovId, lovUrl, lovTableSchema } of lovsDependentOnEventVersion) {
            if (failingNamespaces.has(lovNsp)) continue
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
        const callName = [nsp, functionName].join('.')
        if (!inputContractCallsToLovs.hasOwnProperty(callName)) {
            inputContractCallsToLovs[callName] = []
        }
        inputContractCallsToLovs[callName].push({
            lovNsp,
            lovId: Number(lovId),
            lovUrl,
            lovTableSchema: lovTablePath.split('.')[0],
        })
    }
    return inputContractCallsToLovs
}

async function getLiveObjectVersionToEventVersionMappings(
    eventVersionComps: StringKeyMap[],
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
        const eventVersion = toNamespacedVersion(nsp, name, version)
        if (!inputEventVersionsToLovs.hasOwnProperty(eventVersion)) {
            inputEventVersionsToLovs[eventVersion] = []
        }
        inputEventVersionsToLovs[eventVersion].push({
            lovNsp,
            lovId: Number(lovId),
            lovUrl,
            lovTableSchema: lovTablePath.split('.')[0],
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
live_object_versions.config -> 'table' as lov_table_path
from live_event_versions
join event_versions on live_event_versions.event_version_id = event_versions.id
join live_object_versions on live_event_versions.live_object_version_id = live_object_versions.id
where (${andClauses.join(' or ')})
and live_event_versions.is_input = true
and live_object_versions.url is not null
and live_object_versions.status = 1`

    let results = []
    try {
        results = (await CoreDB.query(sql, bindings)) || []
    } catch (err) {
        throw `[${blockNumber}] Error finding live object versions with event versions: ${err}`
    }

    return camelizeKeys(results)
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
live_object_versions.config -> 'table' as lov_table_path
from live_call_handlers
join namespaces on live_call_handlers.namespace_id = namespaces.id
join live_object_versions on live_call_handlers.live_object_version_id = live_object_versions.id
where (${andClauses.join(' or ')})
and live_object_versions.url is not null
and live_object_versions.status = 1`

    let results = []
    try {
        results = (await CoreDB.query(sql, bindings)) || []
    } catch (err) {
        throw `[${blockNumber}] Error finding live object versions through live call handlers: ${err}`
    }

    return camelizeKeys(results)
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