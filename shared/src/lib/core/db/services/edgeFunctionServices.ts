import { Namespace } from '../entities/Namespace'
import { EdgeFunction } from '../entities/EdgeFunction'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const edgeFunctions = () => CoreDB.getRepository(EdgeFunction)

export async function createEdgeFunction(
    namespace: Namespace,
    name: string,
    desc: string
): Promise<EdgeFunction> {
    const edgeFunction = new EdgeFunction()
    edgeFunction.namespace = namespace
    edgeFunction.name = name
    edgeFunction.desc = desc

    try {
        await edgeFunctions().save(edgeFunction)
    } catch (err) {
        logger.error(
            `Error creating EdgeFunction(name=${name}, desc=${desc}) for Namespace(id=${namespace.id}): ${err}`
        )
        throw err
    }

    return edgeFunction
}
