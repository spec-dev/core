import { LiveObject } from '../entities/LiveObject'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'

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

export async function upsertLiveObject(data: StringKeyMap, tx: any): Promise<LiveObject | null> {
    const conflictCols = ['namespace_id', 'name']
    const updateCols = ['display_name', 'desc']
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(LiveObject)
                .values(data)
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
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
        return null
    }

    return liveObject
}

export async function getLiveObjectByUid(uid: string): Promise<LiveObject | null> {
    let liveObject
    try {
        liveObject = await liveObjects().findOneBy({ uid })
    } catch (err) {
        logger.error(`Error getting LiveObject for uid=${uid}: ${err}`)
        return null
    }
    return liveObject
}
