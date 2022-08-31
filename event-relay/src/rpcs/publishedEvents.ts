import { AGServerSocket } from 'socketcluster-server'
import { EventCursor } from '../types'
import config from '../config'
import { getPublishedEventsAfterId, logger } from '../../../shared'
import { toChunks } from '../utils/formatters'

interface GetEventsAfterCursorsPayload {
    cursors: EventCursor[]
    channel: string
}

export async function getEventsAfterCursors(request: any, socket: AGServerSocket) {
    // Parse payload and ensure event cursors are unique by event.
    const { cursors, channel } = request.data as GetEventsAfterCursorsPayload
    const eventCursors = uniqueEventCursors(cursors)
    if (!eventCursors.length) {
        request.end([])
        return
    }
    // Transfer all events to the client from the given cursors.
    await Promise.all(eventCursors.map(ec => getEventsAfterCursor(ec, socket, channel)))
    request.end([])
}

async function getEventsAfterCursor(cursor: EventCursor, socket: AGServerSocket, channel: string) {
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
            await socket.exchange.invokePublish(channel, batch)
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