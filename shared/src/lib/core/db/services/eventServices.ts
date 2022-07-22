import { Event, EventTopic } from '../entities/Event'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const events = () => CoreDB.getRepository(Event)

export async function createEvent(
    namespaceId: number,
    name: string,
    topic: EventTopic,
    isContractEvent: boolean,
    desc?: string
): Promise<Event> {
    const event = new Event()
    event.uid = uuid4()
    event.namespaceId = namespaceId
    event.name = name
    event.desc = desc
    event.topic = topic
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
