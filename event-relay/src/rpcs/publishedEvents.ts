import { AGServerSocket } from 'socketcluster-server'
import { EventCursor } from '../types'
import config from '../config'
import { getPublishedEventsAfterId, logger, toChunks } from '../../../shared'

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

    // Transfer all events to the client from the given cursors.
    await Promise.all(eventCursors.map(ec => getEventsAfterCursor(ec, publish, channel)))
    await publish(channel, { done: true })
}

async function getEventsAfterCursor(cursor: EventCursor, publish, channel) {
    const eventsAfterCursor = await getPublishedEventsAfterId(cursor.nonce, cursor.name)
    if (!eventsAfterCursor.length) return

    const specEvents = eventsAfterCursor.map(publishedEvent => ({
        id: publishedEvent.uid,
        nonce: publishedEvent.id,
        name: publishedEvent.name,
        origin: { 
            ...publishedEvent.origin, 
            eventTimestamp: publishedEvent.timestamp.toISOString(),
        },
        data: publishedEvent.data,
    }))
    
    const batches = toChunks(specEvents, config.FETCHING_MISSED_EVENTS_BATCH_SIZE)
    
    for (let batch of batches) {
        try {
            await publish(channel, batch)
        } catch (err) {
            logger.error(`Error sending missed events over the wire: ${err}.`)
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