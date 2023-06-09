import {
    CoreDB,
    StringKeyMap,
    logger,
    storePublishedEvent,
    nowAsUTCDateString,
    getLastEventId,
    hash,
} from '..'
import { createEventClient } from '@spec.dev/event-client'
import config from './config'
import short from 'short-uuid'
import chalk from 'chalk'

// Client that publishes events to the event relay.
const eventClient = config.CONNECT_TO_EVENT_RELAY
    ? createEventClient({
          hostname: config.EVENT_RELAY_HOSTNAME,
          port: config.EVENT_RELAY_PORT,
          signedAuthToken: config.PUBLISHER_ROLE_KEY,
          onConnect: () => logger.info('Connected to event-relay.'),
      })
    : null

const formatSpecEvent = (eventSpec: StringKeyMap, eventTimestamp: string): StringKeyMap => {
    const { name, data, origin } = eventSpec
    return {
        name,
        origin: {
            ...origin,
            eventTimestamp,
        },
        data,
    }
}

const formatSpecCall = (callSpec: StringKeyMap, eventTimestamp: string): StringKeyMap => {
    const { name, origin, inputs, inputArgs, outputs, outputArgs } = callSpec
    delete origin.transactionIndex
    delete origin.traceIndex
    return {
        id: short.generate(),
        name,
        origin: {
            ...origin,
            eventTimestamp,
        },
        inputs,
        inputArgs,
        outputs,
        outputArgs,
    }
}

const formatReorgEvent = (
    id: string,
    chainId: string,
    blockNumber: number,
    eventTimestamp: string
): StringKeyMap => {
    return {
        id,
        name: [config.REORG_EVENT_NAME_PREFIX, chainId].join(':'),
        chainId,
        blockNumber,
        eventTimestamp,
    }
}

export async function getDBTimestamp(): Promise<string> {
    try {
        const result = await CoreDB.query(`select timezone('UTC', now())`)
        return new Date(result[0].timezone.toUTCString()).toISOString()
    } catch (err) {
        return nowAsUTCDateString()
    }
}

export async function publishEvents(
    eventSpecs: StringKeyMap[],
    generated: boolean,
    eventTimestamp?: string
) {
    if (!eventSpecs?.length) return

    // Format event specs as spec events.
    eventTimestamp = eventTimestamp || (await getDBTimestamp())
    const events = eventSpecs.map((es) => formatSpecEvent(es, eventTimestamp))

    // Group events by name.
    const eventsByName = {}
    for (const event of events) {
        eventsByName[event.name] = eventsByName[event.name] || []
        eventsByName[event.name].push(event)
    }

    // Get the last id for each event.
    const sortedEventNames = Object.keys(eventsByName).sort()
    const lastIds = await Promise.all(sortedEventNames.map(getLastEventId))
    const eventIds = {}
    for (let i = 0; i < sortedEventNames.length; i++) {
        eventIds[sortedEventNames[i]] = lastIds[i]
    }

    // Save each event to its redis stream, adding its nonce into its payload once saved.
    // The id of each event should be the hash of the previous one.
    const finalEvents = []
    for (const eventName in eventsByName) {
        const eventGroup = eventsByName[eventName]
        let eventId = eventIds[eventName] || 'origin'
        for (const event of eventGroup) {
            eventId = hash(eventId)
            const eventWithId = {
                id: eventId,
                ...event,
            }
            const nonce = await storePublishedEvent(eventWithId)
            if (!nonce) continue
            finalEvents.push({ ...eventWithId, nonce })
        }
    }

    for (const event of finalEvents) {
        await emit(event, generated)
    }
}

export async function publishCalls(callSpecs: StringKeyMap[], eventTimestamp?: string) {
    if (!callSpecs?.length) return

    eventTimestamp = eventTimestamp || (await getDBTimestamp())
    const calls = callSpecs.map((cs) => formatSpecCall(cs, eventTimestamp))
    
    for (const call of calls) {
        await emit(call)
    }
}

export async function publishReorg(id: string, chainId: string, blockNumber: number) {
    const timestamp = await getDBTimestamp()
    await emit(formatReorgEvent(id, chainId, blockNumber, timestamp))
}

export async function emit(event: StringKeyMap, generated?: boolean) {
    const color = generated ? 'cyanBright' : 'white'
    logger.info(
        chalk[color](
            `[${event.origin.chainId}:${event.origin.blockNumber}] Publishing ${event.name}...`
        )
    )
    try {
        await eventClient?.socket.transmitPublish(event.name, event)
    } catch (err) {
        logger.error(`Failed to publish ${event.name}`, event, err)
    }
}
