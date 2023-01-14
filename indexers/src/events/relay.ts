import { SpecEvent } from '@spec.types/spec'
import {
    StringKeyMap,
    logger,
    nowAsUTCDateString,
    storePublishedEvent,
    SharedTables,
} from '../../../shared'
import { createEventClient } from '@spec.dev/event-client'
import config from '../config'
import short from 'short-uuid'

const eventClient = config.IS_RANGE_MODE ? null : createEventClient({
    hostname: config.EVENT_RELAY_HOSTNAME,
    signedAuthToken: config.PUBLISHER_ROLE_KEY,
})

export async function publishEventSpecs(eventSpecs: StringKeyMap[]) {
    if (!eventSpecs.length) return
    
    // Format event specs as spec events.
    const eventTimestamp = await getDBTimestamp()
    const events = eventSpecs.map(es => formatEvent(es, eventTimestamp))

    // Save each event instance to its redis stream, adding its nonce once saved.
    const finalEvents = []
    for (const event of events) {
        const nonce = await storePublishedEvent(event)
        if (!nonce) continue
        finalEvents.push({
            ...event,
            nonce,
        })
    }

    // Emit all spec events.
    finalEvents.forEach(emit)
}

export async function emit(event: SpecEvent<StringKeyMap | StringKeyMap[]>) {
    logger.info(`[${event.origin.chainId}:${event.origin.blockNumber}] Publishing ${event.name}...`)
    // await eventClient.socket.transmitPublish(event.name, event)
}

function formatEvent(eventSpec: StringKeyMap, eventTimestamp: string): StringKeyMap {
    const { name, data, origin } = eventSpec
    return {
        id: short.generate(),
        name,
        origin: {
            ...origin,
            eventTimestamp,
        },
        data,
    }
}

async function getDBTimestamp(): Promise<string> {
    try {
        const result = await SharedTables.query(`select timezone('UTC', now())`)
        return new Date(result[0].timezone.toUTCString()).toISOString()    
    } catch (err) {
        return nowAsUTCDateString()
    }
}