import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'
import short from 'short-uuid'
import { PublishedEvent } from '../entities/PublishedEvent'

const publishedEvents = () => CoreDB.getRepository(PublishedEvent)

export function initPublishedEvent(
    name: string,
    origin: StringKeyMap,
    object: StringKeyMap
): PublishedEvent {
    const publishedEvent = new PublishedEvent()
    publishedEvent.uid = short.generate()
    publishedEvent.name = name
    publishedEvent.origin = origin
    publishedEvent.object = object
    publishedEvent.timestamp = origin.eventTimestamp
    return publishedEvent
}

export async function savePublishedEvents(records: PublishedEvent[]): Promise<boolean> {
    try {
        await CoreDB.manager.transaction(async (tx) => {
            await tx.createQueryBuilder().insert().into(PublishedEvent).values(records).execute()
        })
        return true
    } catch (err) {
        logger.error(`Failed to save published events: ${err?.message || err}`)
        return false
    }
}

export async function getPublishedEventsAfterId(
    id: number,
    name: string
): Promise<PublishedEvent[]> {
    let records = []
    try {
        records = await publishedEvents()
            .createQueryBuilder('publishedEvent')
            .where('publishedEvent.name = :name AND publishedEvent.id > :id', { name, id })
            .getMany()
    } catch (err) {
        logger.error(`Error fetching published events after id ${id}: ${err?.message || err}`)
        return []
    }
    return records
}
