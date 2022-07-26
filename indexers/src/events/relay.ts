
import { SpecEvent } from '@spec.types/spec'
import { StringKeyMap, logger } from 'shared'
import { createEventClient } from '@spec.dev/event-client'
import config from '../config'

const eventClient = createEventClient({
    hostname: config.EVENT_RELAY_HOSTNAME,
    signedAuthToken: config.PUBLISHER_ROLE_KEY,
})

export async function emit(event: SpecEvent<StringKeyMap>) {
    logger.info(`Publishing ${event.name}...`)
    eventClient.socket.transmitPublish(event.name, event)
}