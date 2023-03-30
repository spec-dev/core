import { StringKeyMap, logger, storePublishedEvent, CoreDB, nowAsUTCDateString } from '../../shared'
import { createEventClient } from '@spec.dev/event-client'
import config from './config'
import short from 'short-uuid'
import chalk from 'chalk'

// Client that publishes events to the event relay.
const eventClient = createEventClient({
    hostname: config.EVENT_RELAY_HOSTNAME,
    signedAuthToken: config.PUBLISHER_ROLE_KEY,
})

const formatSpecEvent = (eventSpec: StringKeyMap, eventTimestamp: string): StringKeyMap => {
    const { name, data, origin } = eventSpec
    delete origin.transactionIndex
    delete origin.logIndex
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
    eventTimestamp = eventTimestamp || await getDBTimestamp()
    const events = eventSpecs.map(es => formatSpecEvent(es, eventTimestamp))

    // Save each event to its redis stream, adding its nonce into its payload once saved.
    const finalEvents = []
    for (const event of events) {
        const nonce = await storePublishedEvent(event)
        if (!nonce) continue
        finalEvents.push({ ...event, nonce })
    }

    if (!generated) {
        const { chainId, blockNumber } = finalEvents[0].origin
        logger.info(`[${chainId}:${blockNumber}] Publishing ${finalEvents.length} origin events...`)
    }

    for (const event of finalEvents) {
        await emit(event, generated)
    }
}

export async function publishCalls(callSpecs: StringKeyMap[], eventTimestamp: string) {
    if (!callSpecs?.length) return
    
    const calls = callSpecs.map(cs => formatSpecCall(cs, eventTimestamp))
    const { chainId, blockNumber } = calls[0].origin
    logger.info(`[${chainId}:${blockNumber}] Publishing ${calls.length} contract calls...`)

    for (const call of calls) {
        await emit(call)
    }
}

export async function emit(event: StringKeyMap, generated?: boolean) {
    generated && logger.info(chalk.cyanBright(
        `[${event.origin.chainId}:${event.origin.blockNumber}] Publishing ${event.name}...`
    ))
    await eventClient.socket.transmitPublish(event.name, event)
}