import { EventCursor } from '../types'
import config from '../config'
import { getPublishedEventsAfterEventCursors, logger, toChunks } from '../../../shared'

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

    await getNewEventsAfterCursors(eventCursors, publish, channel)
    await publish(channel, { done: true })
}

async function getNewEventsAfterCursors(cursors: EventCursor[], publish, channel) {
    const eventsMap = await getPublishedEventsAfterEventCursors(cursors)

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