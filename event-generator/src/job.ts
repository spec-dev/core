import { logger, sleep, CoreDB, StringKeyMap, getBlockEvents, fromNamespacedVersion, uniqueByKeys, toNamespacedVersion, deleteBlockEvents, deleteBlockCalls, getSkippedBlocks, newTablesJWT, getFailingNamespaces, getBlockCalls } from '../../shared'
import config from './config'
import { publishEvents, publishCalls, getDBTimestamp } from './relay'
import { camelizeKeys } from 'humps'
import fetch from 'cross-fetch'

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

    // Go ahead and publish all calls & origin events up-front.
    const hasContractCalls = contractCalls.length > 0
    const hasOriginEvents = originEvents.length > 0
    const eventTimestamp = (hasContractCalls || hasOriginEvents) ? await getDBTimestamp() : null
    hasContractCalls && await publishContractCalls(contractCalls, blockNumber, eventTimestamp)
    hasOriginEvents && await publishOriginEvents(originEvents, blockNumber, eventTimestamp)

    // Map event versions to the live object versions that depend on them.
    const uniqueEventVersionComps = getUniqueEventVersionComps(originEvents)
    const {
        inputEventVersionsToLovs,
        generatedEventVersionsWhitelist,
    } = await getLiveObjectVersionToEventVersionMappings(
        uniqueEventVersionComps,
        blockNumber,
    )

    // Get failing namespaces to avoid generating events for.
    const failingNamespaces = new Set(await getFailingNamespaces(config.CHAIN_ID))

    // Group origin events by live object version namespace. Then within each namespace, 
    // group the events even further if their adjacent events share the same live object version.
    const eventGroups = groupEventsByLovNamespace(
        originEvents,
        inputEventVersionsToLovs,
        failingNamespaces,
    )

    // Generate events for each namespace group in parallel.
    const promises = []
    for (const lovNsp in eventGroups) {
        promises.push(generateEventsForNamespace(
            lovNsp,
            eventGroups[lovNsp], 
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

async function generateEventsForNamespace(
    nsp: string,
    eventGroups: StringKeyMap[],
    generatedEventVersionsWhitelist: StringKeyMap,
    blockNumber: number,
) {
    const tablesApiTokens = {}

    for (const eventGroup of eventGroups) {
        const { lovId, lovUrl, lovTableSchema, events } = eventGroup

        // Create JWT for event generator to use when querying our tables api.
        if (!tablesApiTokens[lovTableSchema]) {
            tablesApiTokens[lovTableSchema] = newTablesApiToken(lovTableSchema)
        }

        let generatedEvents = await generateLiveObjectEventsWithProtection(
            lovId,
            lovUrl,
            generatedEventVersionsWhitelist[lovId],
            events,
            tablesApiTokens[lovTableSchema],
            blockNumber,
        )
        if (generatedEvents === null && events?.length > 1) {
            generatedEvents = (await Promise.all(events.map(event => generateLiveObjectEventsWithProtection(
                lovId,
                lovUrl,
                generatedEventVersionsWhitelist[lovId],
                [event],
                tablesApiTokens[lovTableSchema],
                blockNumber,
            )))).filter(v => v !== null).flat()
        }
        if (!generatedEvents?.length) continue

        // Publish generated events on-the-fly as they come back.
        try {
            await publishEvents(generatedEvents, true)
        } catch (err) {
            throw `[${blockNumber}] Publishing events for namespace ${nsp} failed: ${err}`
        }
    }
}

async function generateLiveObjectEventsWithProtection(
    lovId: string,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    inputEvents: StringKeyMap[],
    tablesApiToken: string,
    blockNumber: number,
): Promise<StringKeyMap[] | null> {
    let data: StringKeyMap = {}
    try {
        data = await generateLiveObjectEvents(
            lovId,
            lovUrl,
            acceptedOutputEvents,
            inputEvents,
            tablesApiToken,
            blockNumber,
        )
    } catch (err) {
        logger.error(`[${blockNumber}]: Generating events failed (lovId=${lovId}) for input events: ${JSON.stringify(inputEvents, null, 4)}`)
        return null
    }

    const liveObjectEvents = data?.liveObjectEvents || []
    const retryInputEvents = data?.retryInputEvents || []
    if (!retryInputEvents.length) {
        return liveObjectEvents
    }

    await sleep(1000)
    const eventsReceivedOnRetry = []

    for (const { inputEvent, pendingEvents } of retryInputEvents) {
        const originalPendingEvents = pendingEvents || []
        let attempt = 0
        let success = false
        while (attempt < 3) {
            let retryData: StringKeyMap = {}
            try {
                retryData = await generateLiveObjectEvents(
                    lovId,
                    lovUrl,
                    acceptedOutputEvents,
                    [inputEvent],
                    tablesApiToken,
                    blockNumber,
                )
            } catch (err) {
                logger.error(`[${blockNumber}] Retrying event-generation failed (lovId=${lovId}). Input event: ${JSON.stringify(inputEvent, null, 4)}`)
            }
            const events = retryData?.liveObjectEvents || []
            if (events.length) {
                eventsReceivedOnRetry.push(...events)
                success = true
                break
            }
            await sleep(500)
            attempt++
        }

        if (!success && originalPendingEvents.length) {
            eventsReceivedOnRetry.push(...originalPendingEvents)
        }

        if (!success) {
            logger.error(`[${blockNumber}] Not able to recover all empty data events for input event ${JSON.stringify(inputEvent, null, 4)}`)
        }
    }

    liveObjectEvents.push(...eventsReceivedOnRetry)
    return liveObjectEvents
}   

async function generateLiveObjectEvents(
    lovId: string,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    inputEvents: StringKeyMap[],
    tablesApiToken: string,
    blockNumber: number,
    attempts: number = 0,
): Promise<StringKeyMap> {
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
            body: JSON.stringify(inputEvents),
            signal: abortController.signal,
        })
    } catch (err) {
        clearTimeout(timer)
        const error = `[${blockNumber}] Request error to ${lovUrl} (lovId=${lovId}): ${err}`
        logger.error(error)
        if (attempts <= 10) {
            await sleep(1000)
            return generateLiveObjectEvents(
                lovId,
                lovUrl,
                acceptedOutputEvents,
                inputEvents,
                tablesApiToken,
                blockNumber,
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
        logger.error(`[${blockNumber}] Failed to parse JSON response (lovId=${lovId}): ${err} - inputEvents: ${JSON.stringify(inputEvents, null, 4)}`)
    }
    if (resp?.status !== 200) {
        const msg = `[${blockNumber}] Request to ${lovUrl} (lovId=${lovId}) failed with status ${resp?.status}: ${JSON.stringify(generatedEventGroups || [])}.`
        logger.error(msg)
        if (attempts <= 10) {
            await sleep(1000)
            return generateLiveObjectEvents(
                lovId,
                lovUrl,
                acceptedOutputEvents,
                inputEvents,
                tablesApiToken,
                blockNumber,
                attempts + 1,
            )
        } else {
            throw msg
        }
    }
    if (!generatedEventGroups?.length) {
        return { liveObjectEvents: [], retryInputEvents: [] }
    }

    // Filter generated events by those that are allowed to be created / registered with Spec.
    const liveObjectEvents = []
    const retryInputEvents = []
    let i = 0
    for (const generatedEvents of generatedEventGroups) {
        const inputEvent = inputEvents[i]
        const receivedEmptyGeneratedEvent = !!generatedEvents.find(e => e?.data && !Object.keys(e.data).length)
        const pendingEvents = []
        
        for (const event of generatedEvents) {
            if (!acceptedOutputEvents.has(event.name)) {
                logger.error(`[${blockNumber}] Live object (lovId=${lovId}) is not allowed to generate event: ${event.name}`)
                continue
            }

            if (!Object.keys(event.data || {}).length) {
                logger.error(`[${blockNumber}] Received empty generated event for input event ${JSON.stringify(inputEvent, null, 4)}`)
                continue
            }

            const liveObjectEvent = {
                ...event,
                origin: inputEvent.origin,
            }

            receivedEmptyGeneratedEvent 
                ? pendingEvents.push(liveObjectEvent) 
                : liveObjectEvents.push(liveObjectEvent)
        }
        
        if (receivedEmptyGeneratedEvent) {
            console.log('generatedEvents', generatedEvents)
            retryInputEvents.push({ inputEvent, pendingEvents })
        }
        i++
    }

    return { liveObjectEvents, retryInputEvents }
}

function groupEventsByLovNamespace(
    events: StringKeyMap[], 
    inputEventVersionsToLovs: StringKeyMap,
    failingNamespaces: Set<string>,
) {
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
    const lovIds = new Set<number>()
    for (const result of lovResults) {
        const { nsp, name, version, lovNsp, lovId, lovUrl, lovTablePath } = result
        const eventVersion = toNamespacedVersion(nsp, name, version)
        if (!inputEventVersionsToLovs.hasOwnProperty(eventVersion)) {
            inputEventVersionsToLovs[eventVersion] = []
        }
        const numericLovId = Number(lovId)
        lovIds.add(numericLovId)
        inputEventVersionsToLovs[eventVersion].push({
            lovNsp,
            lovId: numericLovId,
            lovUrl,
            lovTableSchema: lovTablePath.split('.')[0],
        })
    }

    const generatedEventVersionResults = await getGeneratedEventVersionsForLovs(
        Array.from(lovIds),
        blockNumber,
    )

    // Map live object versions to the event versions they are allowed to generate (i.e. outputs).
    const generatedEventVersionsWhitelist = {}
    for (const { nsp, name, version, lovId } of generatedEventVersionResults) {
        const numericLovId = Number(lovId)
        if (!generatedEventVersionsWhitelist.hasOwnProperty(numericLovId)) {
            generatedEventVersionsWhitelist[numericLovId] = new Set()
        }
        generatedEventVersionsWhitelist[numericLovId].add(toNamespacedVersion(nsp, name, version))
    }

    return {
        inputEventVersionsToLovs,
        generatedEventVersionsWhitelist,
    }
}

async function getLiveObjectVersionsFromInputLiveEventVersions(
    eventVersionComps: StringKeyMap[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
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
        originEvents.map(e => fromNamespacedVersion(e.name)).filter(e => !!e.nsp && !!e.name && !!e.version),
        ['nsp', 'name', 'version']
    )
}

function newTablesApiToken(schema: string) {
    return newTablesJWT(schema, config.EVENT_GEN_RESPONSE_TIMEOUT * 100)
}

export default perform