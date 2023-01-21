import { EdgeFunction } from '../entities/EdgeFunction'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'

const edgeFunctions = () => CoreDB.getRepository(EdgeFunction)

export async function createEdgeFunction(
    namespaceId: number,
    name: string,
    desc: string
): Promise<EdgeFunction> {
    const edgeFunction = new EdgeFunction()
    edgeFunction.namespaceId = namespaceId
    edgeFunction.name = name
    edgeFunction.desc = desc

    try {
        await edgeFunctions().save(edgeFunction)
    } catch (err) {
        logger.error(
            `Error creating EdgeFunction(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return edgeFunction
}

export async function getEdgeFunction(
    namespaceId: number,
    name: string
): Promise<EdgeFunction | null> {
    let edgeFunction

    try {
        edgeFunction = await edgeFunctions().findOneBy({
            namespaceId,
            name,
        })
    } catch (err) {
        logger.error(
            `Error getting EdgeFunction for namespaceId=${namespaceId}, name=${name}: ${err}`
        )
        throw err
    }

    return edgeFunction || null
}

export async function getEdgeFunctions(): Promise<EdgeFunction[] | null> {
    try {
        return await edgeFunctions().find()
    } catch (err) {
        logger.error(`Error getting EdgeFunctions: ${err}`)
        return null
    }
}

export async function upsertEdgeFunction(
    data: StringKeyMap,
    tx: any
): Promise<EdgeFunction | null> {
    const conflictCols = ['namespace_id', 'name']
    const updateCols = ['desc']
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(EdgeFunction)
                .values(data)
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
}
