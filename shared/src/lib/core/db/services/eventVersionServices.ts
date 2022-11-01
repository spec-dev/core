import { EventVersion } from '../entities/EventVersion'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const eventVersions = () => CoreDB.getRepository(EventVersion)

export async function createEventVersion(
    nsp: string,
    eventId: number,
    name: string,
    version: string,
    chainId?: number | null
): Promise<EventVersion> {
    const eventVersion = new EventVersion()
    eventVersion.uid = uuid4()
    eventVersion.nsp = nsp
    eventVersion.name = name
    eventVersion.version = version
    eventVersion.eventId = eventId
    if (chainId) {
        eventVersion.chainId = chainId
    }

    try {
        await eventVersions().save(eventVersion)
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
    version: string,
    chainId: number
): Promise<EventVersion | null> {
    try {
        return await eventVersions().findOneBy({ nsp, name, version, chainId })
    } catch (err) {
        logger.error(`Error getting EventVersion ${nsp}.${name}@${version}, chainId=${chainId}: ${err}`)
        return null
    }
}
