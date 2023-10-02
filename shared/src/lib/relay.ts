import {
    CoreDB,
    StringKeyMap,
    logger,
    storePublishedEvent,
    nowAsUTCDateString,
    getLastEventId,
    hash,
    getEventIdDirectlyBeforeId,
    fromNamespacedVersion,
    toNamespacedVersion,
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
    delete origin._id
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

    eventTimestamp = eventTimestamp || (await getDBTimestamp())
    const events = eventSpecs.map((es) => formatSpecEvent(es, eventTimestamp))

    for (const event of events) {
        // For backwards compatibility for now --------
        const lastEventId = (await getLastEventId(event.name)) || 'origin'
        const newEventId = hash(lastEventId)
        const eventWithId = { id: newEventId, ...event }
        // --------------------------------------------
        const nonce = await storePublishedEvent(eventWithId)
        const prevNonce = await getEventIdDirectlyBeforeId(event.name, nonce)
        const eventToEmit = { ...eventWithId, nonce, prevNonce }
        await emit(eventToEmit, generated)
    }
}

// NOTE: Not actively doing this anymore.
export async function publishCalls(callSpecs: StringKeyMap[], eventTimestamp?: string) {
    if (!callSpecs?.length) return

    eventTimestamp = eventTimestamp || (await getDBTimestamp())
    const calls = callSpecs.map((cs) => formatSpecCall(cs, eventTimestamp))

    const { chainId, blockNumber } = calls[0].origin
    logger.info(`[${chainId}:${blockNumber}] Publishing ${calls.length} contract calls...`)

    for (const call of calls) {
        await emit(call)
    }
}

export async function publishReorg(id: string, chainId: string, blockNumber: number) {
    const timestamp = await getDBTimestamp()
    await emit(formatReorgEvent(id, chainId, blockNumber, timestamp))
}

export async function emit(event: StringKeyMap, generated?: boolean) {
    if (event.origin) {
        let displayName = event.name
        if (event.name.includes('@')) {
            const { nsp, name, version } = fromNamespacedVersion(event.name)
            displayName = toNamespacedVersion(nsp, name, version?.slice(0, 10))
        }
        logger.info(
            chalk.cyanBright(
                `[${event.origin.chainId}:${event.origin.blockNumber}] Publishing ${displayName}...`
            )
        )
    }
    try {
        await eventClient?.socket.transmitPublish(event.name, event)
    } catch (err) {
        logger.error(`Failed to publish ${event.name}`, event, err)
    }
}
