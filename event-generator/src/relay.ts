import { SpecEvent } from '@spec.types/spec'
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

async function getDBTimestamp(): Promise<string> {
    try {
        const result = await CoreDB.query(`select timezone('UTC', now())`)
        return new Date(result[0].timezone.toUTCString()).toISOString()    
    } catch (err) {
        return nowAsUTCDateString()
    }
}

export async function publishEvents(eventSpecs: StringKeyMap[], generated?: boolean) {
    if (!eventSpecs?.length) return
    
    // Format event specs as spec events.
    const eventTimestamp = await getDBTimestamp()
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

export async function emit(event: SpecEvent, generated?: boolean) {
    const log = `[${event.origin.chainId}:${event.origin.blockNumber}] Publishing ${event.name}...`
    generated && logger.info(chalk.cyanBright(log))
    await eventClient.socket.transmitPublish(event.name, event)
}