import { LiveCallHandler } from '../entities/LiveCallHandler'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'

const liveCallHandlers = () => CoreDB.getRepository(LiveCallHandler)

export async function createLiveCallHandler(
    functionName: string,
    namespaceId: number,
    liveObjectVersionId: number
): Promise<LiveCallHandler> {
    const liveCallHandler = new LiveCallHandler()
    liveCallHandler.functionName = functionName
    liveCallHandler.namespaceId = namespaceId
    liveCallHandler.liveObjectVersionId = liveObjectVersionId

    try {
        await liveCallHandlers().save(liveCallHandler)
    } catch (err) {
        logger.error(
            `Error creating LiveCallHandler(
                namespaceId=${namespaceId},
                liveObjectVersionId=${liveObjectVersionId},
                functionName=${functionName}
            ): ${err}`
        )
        throw err
    }

    return liveCallHandler
}

export async function createLiveCallHandlersWithTx(
    data: StringKeyMap[],
    tx: any
): Promise<LiveCallHandler[]> {
    return (
        await tx
            .createQueryBuilder()
            .insert()
            .into(LiveCallHandler)
            .values(data)
            .orIgnore()
            .returning('*')
            .execute()
    ).generatedMaps
}
