import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { fromNamespacedVersion } from '../../../utils/formatters'

const eventVersionsRepo = () => CoreDB.getRepository(EventVersion)

export async function createEventVersion(
    eventId: number,
    nsp: string,
    name: string,
    version: string
): Promise<EventVersion> {
    const eventVersion = new EventVersion()
    eventVersion.uid = uuid4()
    eventVersion.nsp = nsp
    eventVersion.name = name
    eventVersion.version = version
    eventVersion.eventId = eventId

    try {
        await eventVersionsRepo().save(eventVersion)
    } catch (err) {
        logger.error(
            `Error creating EventVersion(nsp=${nsp}, name=${name}, version=${version}): ${err}`
        )
        throw err
    }

    return eventVersion
}

export async function upsertEventVersions(
    data: {
        eventId: number
        nsp: string
        name: string
        version: string
    }[]
): Promise<EventVersion[] | null> {
    let eventVersions = data.map((entry) => {
        const eventVersion = new EventVersion()
        eventVersion.uid = uuid4()
        eventVersion.nsp = entry.nsp
        eventVersion.name = entry.name
        eventVersion.version = entry.version
        eventVersion.eventId = entry.eventId
        return eventVersion
    })

    try {
        eventVersions = await eventVersionsRepo().save(eventVersions)
    } catch (err) {
        logger.error(`Error upserting event versions: ${err}`)
        return null
    }

    return eventVersions
}

export async function getEventVersion(
    nsp: string,
    name: string,
    version: string
): Promise<EventVersion | null> {
    try {
        return await eventVersionsRepo().findOneBy({ nsp, name, version })
    } catch (err) {
        logger.error(`Error getting EventVersion ${nsp}.${name}@${version}: ${err}`)
        return null
    }
}

export async function getEventVersionsByNamespacedVersions(
    namespacedVersions: string[]
): Promise<EventVersion[]> {
    const validNamespacedVersions = namespacedVersions
        .map(fromNamespacedVersion)
        .filter((obj) => !!obj.nsp && !!obj.name && !!obj.version)
    if (!validNamespacedVersions.length) return []

    let eventVersions = []
    try {
        eventVersions = await eventVersionsRepo().find({ where: validNamespacedVersions })
    } catch (err) {
        logger.error(
            `Error fetching EventVersions for namespacedVersions: ${validNamespacedVersions.join(
                ', '
            )}`
        )
        return []
    }
    return eventVersions
}
