import { EventCursor } from '../types'
import config from '../config'
import { 
    SharedTables, 
    getPublishedEventsAfterEventCursors, 
    logger, 
    schemaForChainId, 
    StringKeyMap, 
    toChunks, 
    range,
    identPath,
} from '../../../shared'

interface GetEventsAfterCursorsPayload {
    cursors: EventCursor[]
    channel: string
}

export async function getEventsAfterCursors(request: any, publish: any) {
    // Parse payload and ensure event cursors are unique by event.
    const { cursors, channel } = request.data as GetEventsAfterCursorsPayload
    const eventCursors = uniqueEventCursors(cursors)
    if (!eventCursors.length) {
        request.end([])
        return
    }

    request.end([])

    try {
        await getNewEventsAfterCursors(eventCursors, publish, channel)
        await publish(channel, { done: true })    
    } catch (err) {
        logger.error(
            `Failed to supply missed events for cursors (${JSON.stringify(eventCursors)}): ${err}`
        )
    }
}

function uniqueEventCursors(cursors: EventCursor[]): EventCursor[] {
    const eventCursors = []
    const eventsSeen = new Set<string>()
    for (let cursor of cursors) {
        if (eventsSeen.has(cursor.name)) {
            continue
        }
        eventsSeen.add(cursor.name)
        eventCursors.push(cursor)
    }
    return eventCursors
}

async function getNewEventsAfterCursors(cursors: EventCursor[], publish, channel) {
    const eventsMap = await markInvalidEvents(
        await getPublishedEventsAfterEventCursors(cursors)
    )

    for (const eventName in eventsMap) {
        const specEvents = eventsMap[eventName] || []
        if (!specEvents.length) continue

        const batches = toChunks(specEvents, config.FETCHING_MISSED_EVENTS_BATCH_SIZE)
    
        for (let batch of batches) {
            try {
                await publish(channel, batch)
            } catch (err) {
                logger.error(`Error sending missed events over the wire: ${err}.`)
            }
        }    
    }
}   

async function markInvalidEvents(
    eventsMap: { [key: string]: StringKeyMap[] }
): Promise<{ [key: string]: StringKeyMap[] }> {
    // Get all events as a single list regardless of event name.
    const events = Object.values(eventsMap).flat()

    // Aggregate unique block numbers referenced by chain across all events.
    const referencedBlockNumbers = {}
    for (const event of events) {
        const origin = event.origin || {}
        if (origin.chainId && origin.hasOwnProperty('blockNumber')) {
            const chainId = origin.chainId
            const blockNumber = Number(origin.blockNumber)
            referencedBlockNumbers[chainId] = referencedBlockNumbers[chainId] || new Set()
            referencedBlockNumbers[chainId].add(blockNumber)
        }
    }

    // Build queries to fetch the hash/number combo for each chain.
    const queries = []
    const chainIds = []
    for (const chainId in referencedBlockNumbers) {
        const schema = schemaForChainId[chainId]
        const blockNumbers = Array.from(referencedBlockNumbers[chainId])
        if (!schema || !blockNumbers.length) continue
        chainIds.push(chainId)
        const phs = range(1, blockNumbers.length).map(i => `$${i}`)
        queries.push({
            sql: `select hash, number from ${identPath([schema, 'blocks'].join('.'))} where number in (${phs.join(', ')})`,
            bindings: blockNumbers,
        })
    }

    // Run all queries built above in parallel.
    let results = []
    try {
        results = (await Promise.all(queries.map(({ sql, bindings }) => (
            SharedTables.query(sql, bindings)
        )))) || []
    } catch (err) {
        logger.error(`Error fetching hashes for blocks:`, queries, err)
        return eventsMap
    }

    /*
        Build the following structure:
        {
            <chainId>: {
                <blockNumber>: <blockHash>
                ...
            },
            ...
        }
    */
    const chainsToNumbersToHashes = {}
    for (let i = 0; i < chainIds.length; i++) {
        const chainId = chainIds[i]
        const hashResults = results[i] || []
        const numbersToHashes = {}
        for (const { hash, number } of hashResults) {
            numbersToHashes[number.toString()] = hash
        }
        chainsToNumbersToHashes[chainId] = numbersToHashes
    }

    // Find any events with invalid block hashes (would be due to reorg)
    // and mark them as invalid for the consumer.
    const finalEventsMap = {}
    for (const key in eventsMap) {
        const events = eventsMap[key] || []
        const finalEvents = []
        for (const event of events) {
            const origin = event.origin || {}
            const { chainId, blockHash } = origin
            if (
                chainId && 
                blockHash && 
                origin.hasOwnProperty('blockNumber') && 
                chainsToNumbersToHashes[chainId] && 
                chainsToNumbersToHashes[chainId][origin.blockNumber.toString()] !== blockHash
            ) {
                event.origin.invalid = true
            }
            finalEvents.push(event)
        }
        finalEventsMap[key] = finalEvents
    }

    return finalEventsMap
}