import { logger, CoreDB, StringKeyMap, getBlockEvents, fromNamespacedVersion, uniqueByKeys, toNamespacedVersion, deleteBlockEvents, getSkippedBlocks, markNamespaceAsFailing, newTablesJWT, getFailingNamespaces } from '../../shared'
import config from './config'
import { publishEvents } from './relay'

async function perform(data: StringKeyMap) {
    const blockNumber = Number(data.blockNumber)
    const skipped = data.skipped || false
    const replay = data.replay || false

    logger.info(`\nGenerating events for block ${blockNumber.toLocaleString()}...`)

    // Get the events for this block number from redis.
    let blockEvents = await getBlockEvents(config.CHAIN_ID, blockNumber)
    if (!blockEvents.length) throw `No block events found for block ${blockNumber}`

    // Separate our custom origin events out from the actual contract events.
    // Contract events also get sorted by transactionIndex->logIndex here as well.
    const { customOriginEvents, contractEvents } = splitOriginEvents(blockEvents, skipped, replay)
    if (!customOriginEvents.length) throw `No custom origin events found for block ${blockNumber}`

    // Go ahead and publish all origin events up-front.
    await publishOriginEvents(blockNumber, customOriginEvents, contractEvents)

    // Map event versions to the live object versions that depend on them.
    const originEvents = [ ...customOriginEvents, ...contractEvents ]
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

    // If any blocks have been skipped, keep the block events in redis. 
    // Otherwise, they can safely be removed.
    const skippedBlocks = await getSkippedBlocks(config.CHAIN_ID)
    if (skippedBlocks.length) return
    await deleteBlockEvents(config.CHAIN_ID, blockNumber)
}

function splitOriginEvents(blockEvents: StringKeyMap[], skipped: boolean, replay: boolean): {
    customOriginEvents: StringKeyMap[]
    contractEvents: StringKeyMap[]
} {
    const customOriginEvents = []
    const contractEvents = []
    for (const event of blockEvents) {
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
    return { 
        customOriginEvents, 
        contractEvents: sortContractEvents(contractEvents),
    }
}

async function publishOriginEvents(
    blockNumber: number,
    customOriginEvents: StringKeyMap[], 
    contractEvents: StringKeyMap[],
) {
    try {
        await publishEvents([ ...customOriginEvents, ...contractEvents ])
    } catch (err) {
        throw `Failed to publish origin events for block ${blockNumber}: ${err}`
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

        // Generate events to publish for this live object.
        let generatedEvents
        try {
            generatedEvents = ((await generateLiveObjectEvents(
                lovId,
                lovUrl,
                generatedEventVersionsWhitelist[lovId],
                events,
                tablesApiTokens[lovTableSchema],
            )) || []).flat()
        } catch (err) {
            logger.error(`[${blockNumber}] Generating events for namespace ${nsp} failed. ${err}`)
            // If any generator ever fails, mark the entire namespace as failing.
            await markNamespaceAsFailing(config.CHAIN_ID, nsp)
            break
        }
        if (!generatedEvents?.length) continue

        // Publish generated events on-the-fly as the come back.
        try {
            await publishEvents(generatedEvents, true)
        } catch (err) {
            throw `[${blockNumber}] Publishing events for namespace ${nsp} failed: ${err}`
        }
    }
}

async function generateLiveObjectEvents(
    lovId: string,
    lovUrl: string,
    acceptedOutputEvents: Set<string>,
    inputEvents: StringKeyMap[],
    tablesApiToken: string,
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
            body: JSON.stringify(inputEvents),
            signal: abortController.signal,
        })
    } catch (err) {
        clearTimeout(timer)
        throw `Request error to ${lovUrl} (lovId=${lovId}): ${err}`
    }
    clearTimeout(timer)
    
    // Get the live object events generated from the response.
    let generatedEventGroups
    try {
        generatedEventGroups = (await resp.json()) || []
    } catch (err) {
        throw `Failed to parse JSON response (lovId=${lovId}): ${err}`
    }
    if (!generatedEventGroups?.length) {
        return []
    }

    // Filter generated events by those that are allowed to be created / registered with Spec.
    const liveObjectEvents = []
    let i = 0
    for (const generatedEvents of generatedEventGroups) {
        const inputEvent = inputEvents[i]
        for (const event of generatedEvents) {
            if (!acceptedOutputEvents.has(event.name)) {
                logger.error(`Live object (lovId=${lovId}) is not allowed to generate event: ${event.name}`)
                continue
            }
            // Attach input event origin to generated events.
            liveObjectEvents.push({
                ...event,
                origin: inputEvent.origin,
            })
        }
        i++
    }

    return liveObjectEvents
}

function groupEventsByLovNamespace(
    events: StringKeyMap[], 
    inputEventVersionsToLovs: StringKeyMap,
    failingNamespaces: Set<string>,
) {
    const eventsByLovNsp = {}
    for (const event of events) {
        const lovsDependentOnEventVersion = inputEventVersionsToLovs[event.name]
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
        let matchingLovId = null
        let lovId, lovUrl, lovTableSchema
        for (const entry of eventsByLovNsp[nsp]) {
            const { event } = entry
            lovId = entry.lovId
            lovUrl = entry.lovUrl
            lovTableSchema = entry.lovTableSchema

            if (matchingLovId === null) {
                adjacentEventsWithSameLov = [event]
                matchingLovId = lovId
                continue
            }

            if (lovId !== matchingLovId) {
                groupedByLov.push({
                    lovId,
                    lovUrl,
                    lovTableSchema,
                    events: adjacentEventsWithSameLov,
                })
                adjacentEventsWithSameLov = [event]
                matchingLovId = lovId
                continue
            }

            adjacentEventsWithSameLov.push(event)
        }
        adjacentEventsWithSameLov.length && groupedByLov.push({
            lovId,
            lovUrl,
            lovTableSchema,
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
        if (!generatedEventVersionsWhitelist.hasOwnProperty(lovId)) {
            generatedEventVersionsWhitelist[lovId] = new Set()
        }
        generatedEventVersionsWhitelist[lovId].add(toNamespacedVersion(nsp, name, version))
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
        andClauses.push(`(event_versions.nsp = $${i} and event_versions.name = $${i + 1} and event_versions.version = $${i + 2} and live_event_versions.is_input = true)`)
        bindings.push(...[nsp, name, version])
        i += 3
    }
    const sql = `select
event_versions.nsp as nsp,
event_versions.name as name,
event_versions.version as version,
live_object_versions.nsp as lovNsp,
live_object_versions.id as lovId,
live_object_versions.url as lovUrl,
live_object_versions.config -> 'table' as lovTablePath
from live_event_versions
join event_versions on live_event_versions.event_version_id = event_versions.id
join live_object_versions on live_event_versions.live_object_version_id = live_object_versions.id
where ${andClauses.join(' or ')}`

    let results = []
    try {
        results = (await CoreDB.query(sql, bindings)) || []
    } catch (err) {
        throw `[${blockNumber}] Error finding live object versions with event versions: ${err}`
    }
    return results
}

async function getGeneratedEventVersionsForLovs(
    lovIds: number[],
    blockNumber: number,
): Promise<StringKeyMap[]> {
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
live_object_versions.id as lovId,
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
    return results
}

function sortContractEvents(contractEvents: StringKeyMap[]): StringKeyMap[] {
    return contractEvents.sort((a, b) => (
        (a.transactionIndex - b.transactionIndex) || 
        (a.logIndex - b.logIndex)
    ))
}

function getUniqueEventVersionComps(originEvents: StringKeyMap[]): StringKeyMap[] {
    return uniqueByKeys(
        originEvents.map(e => fromNamespacedVersion(e.name)).filter(e => !!e.nsp && !!e.name && !!e.version),
        ['nsp', 'name', 'version']
    )
}

function newTablesApiToken(schema: string) {
    return newTablesJWT(schema, config.EVENT_GEN_RESPONSE_TIMEOUT * 5)
}

export default perform