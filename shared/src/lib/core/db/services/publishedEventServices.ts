import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'
import { SpecEvent } from '@spec.types/spec'
import short from 'short-uuid'
import { PublishedEvent } from '../entities/PublishedEvent'

export function initPublishedEvent(event: SpecEvent<StringKeyMap>): PublishedEvent {
    const publishedEvent = new PublishedEvent()
    publishedEvent.id = short.generate()
    publishedEvent.channel = event.name
    publishedEvent.data = event
    publishedEvent.timestamp = event.origin.eventTimestamp
    return publishedEvent
}

export async function savePublishedEvents(records: PublishedEvent[]) {
    try {
        await CoreDB.manager.transaction(async (tx) => {
            await tx.createQueryBuilder().insert().into(PublishedEvent).values(records).execute()
        })
    } catch (err) {
        logger.error(`Failed to save published events: ${err?.message || err}`)
    }
}
