import { Event } from '../entities/Event'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const eventsRepo = () => CoreDB.getRepository(Event)

export async function createEvent(
    namespaceId: number,
    name: string,
    desc?: string,
    isContractEvent?: boolean
): Promise<Event> {
    const event = new Event()
    event.uid = uuid4()
    event.namespaceId = namespaceId
    event.name = name
    event.desc = desc
    event.isContractEvent = isContractEvent || false

    try {
        await eventsRepo().save(event)
    } catch (err) {
        logger.error(
            `Error creating Event(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return event
}

export async function upsertEvents(
    data: {
        namespaceId: number
        name: string
        desc: string
        isContractEvent: boolean
    }[]
): Promise<Event[] | null> {
    let events = data.map((entry) => {
        const event = new Event()
        event.uid = uuid4()
        event.namespaceId = entry.namespaceId
        event.name = entry.name
        event.desc = entry.desc
        event.isContractEvent = entry.isContractEvent || false
        return event
    })

    try {
        events = await eventsRepo().save(events)
    } catch (err) {
        logger.error(`Error upserting events: ${err}`)
        return null
    }

    return events
}

export async function getEvent(namespaceId: number, name: string): Promise<Event | null> {
    let event

    try {
        event = await eventsRepo().findOneBy({
            namespaceId,
            name,
        })
    } catch (err) {
        logger.error(`Error getting Event for namespaceId=${namespaceId}, name=${name}: ${err}`)
        throw err
    }

    return event || null
}
