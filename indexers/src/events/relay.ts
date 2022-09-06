import { SpecEvent, SpecEventOrigin } from '@spec.types/spec'
import { StringKeyMap, logger, initPublishedEvent, PublishedEvent, savePublishedEvents } from '../../../shared'
import { EventOrigin } from '../types'
import { createEventClient } from '@spec.dev/event-client'
import config from '../config'

const eventClient = config.IS_RANGE_MODE ? null : createEventClient({
    hostname: config.EVENT_RELAY_HOSTNAME,
    signedAuthToken: config.PUBLISHER_ROLE_KEY,
})

export async function emit(event: SpecEvent<StringKeyMap | StringKeyMap[]>) {
    logger.info(`Publishing ${event.name}...`)
    eventClient.socket.transmitPublish(event.name, event)
}

export async function publishDiffsAsEvents(
    eventSpecs: StringKeyMap[],
    eventOrigin: EventOrigin,
) {
    // Format diffs as PublishedEvents.
    let publishedEvents: PublishedEvent[] = eventSpecs.map(({ namespacedVersion, diff }) => (
        initPublishedEvent(namespacedVersion, eventOrigin, diff))
    )

    // Save list of PublishedEvents to ensure we have ids.
    publishedEvents = await savePublishedEvents(publishedEvents)
    if (!publishedEvents) return

    // Format PublishedEvents as SpecEvents and publish.
    await Promise.all(publishedEvents.map(publishedEvent => emit(formatSpecEvent(publishedEvent))))
}

function formatSpecEvent(publishedEvent: PublishedEvent): SpecEvent<StringKeyMap> {
    const specEvent: SpecEvent<StringKeyMap> = {
        id: publishedEvent.uid,
        nonce: publishedEvent.id,
        name: publishedEvent.name,
        origin: {
            ...publishedEvent.origin,
            eventTimestamp: publishedEvent.timestamp.toISOString(),
        } as SpecEventOrigin,
        data: publishedEvent.data,
    }
    return specEvent
}
