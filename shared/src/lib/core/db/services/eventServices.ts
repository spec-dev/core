import { Event } from '../entities/Event'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'
import { ILike } from 'typeorm'

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

export async function upsertEventsWithTx(data: StringKeyMap[], tx: any): Promise<Event[]> {
    const entries = data.map((d) => ({ ...d, uid: uuid4() }))
    return (
        await tx
            .createQueryBuilder()
            .insert()
            .into(Event)
            .values(entries)
            .orUpdate(['desc'], ['namespace_id', 'name'])
            .returning('*')
            .execute()
    ).generatedMaps
}

export async function getEvents(filters: StringKeyMap): Promise<Event[] | null> {
    try {
        return await eventsRepo().find({
            relations: { namespace: true, eventVersions: true },
            select: {
                name: true,
                desc: true,
                namespace: {
                    name: true,
                    slug: true,
                },
                eventVersions: {
                    createdAt: true,
                    version: true,
                },
            },
            where: {
                namespace: {
                    slug: ILike(filters.namespace ? `${filters.namespace}.%` : '%'),
                },
            },
            order: { eventVersions: { createdAt: 'DESC' } },
        })
    } catch (err) {
        logger.error(`Error getting Events: ${err}`)
        return null
    }
}
