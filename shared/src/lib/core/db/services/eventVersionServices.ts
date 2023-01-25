import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { fromNamespacedVersion } from '../../../utils/formatters'
import { StringKeyMap } from '../../../types'

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

export async function upsertEventVersionsWithTx(data: StringKeyMap[], tx: any) {
    const entries = data.map((d) => ({ ...d, uid: uuid4() }))
    await tx
        .createQueryBuilder()
        .insert()
        .into(EventVersion)
        .values(entries)
        .orIgnore()
        .returning('*')
        .execute()
}
