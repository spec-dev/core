import { Event } from '../entities/Event'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const events = () => CoreDB.getRepository(Event)

export async function createEvent(
    namespaceId: number,
    name: string,
    isContractEvent: boolean,
    desc?: string
): Promise<Event> {
    const event = new Event()
    event.uid = uuid4()
    event.namespaceId = namespaceId
    event.name = name
    event.desc = desc
    event.isContractEvent = isContractEvent

    try {
        await events().save(event)
    } catch (err) {
        logger.error(
            `Error creating Event(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return event
}

export async function getEvent(namespaceId: number, name: string): Promise<Event | null> {
    let event

    try {
        event = await events().findOneBy({
            namespaceId,
            name,
        })
    } catch (err) {
        logger.error(`Error getting Event for namespaceId=${namespaceId}, name=${name}: ${err}`)
        throw err
    }

    return event || null
}
