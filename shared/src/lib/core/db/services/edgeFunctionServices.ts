import { EdgeFunction } from '../entities/EdgeFunction'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

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
