import { LiveObject } from '../entities/LiveObject'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const liveObjects = () => CoreDB.getRepository(LiveObject)

export async function createLiveObject(
    namespaceId: number,
    name: string,
    desc: string
): Promise<LiveObject> {
    const liveObject = new LiveObject()
    liveObject.uid = uuid4()
    liveObject.namespaceId = namespaceId
    liveObject.name = name
    liveObject.desc = desc

    try {
        await liveObjects().save(liveObject)
    } catch (err) {
        logger.error(
            `Error creating LiveObject(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return liveObject
}

export async function getLiveObject(namespaceId: number, name: string): Promise<LiveObject | null> {
    let liveObject

    try {
        liveObject = await liveObjects().findOneBy({
            namespaceId,
            name,
        })
    } catch (err) {
        logger.error(
            `Error getting LiveObject for namespaceId=${namespaceId}, name=${name}: ${err}`
        )
        throw err
    }

    return liveObject || null
}
