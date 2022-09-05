import { createEdgeFunctionVersion } from '../lib/core/db/services/edgeFunctionVersionServices'
import { getEdgeFunction } from '../lib/core/db/services/edgeFunctionServices'
import { getNamespace } from '../lib/core/db/services/namespaceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(
    nsp: any,
    efName: string,
    efvName: string,
    version: string,
    url: string,
    args?: object | string
) {
    await CoreDB.initialize()

    const namespace = await getNamespace(nsp)
    if (!namespace) {
        logger.error(`No namespace for slug: ${nsp}`)
        exit(1)
    }

    const edgeFunction = await getEdgeFunction(namespace.id, efName)
    if (!edgeFunction) {
        logger.error(`No edge_function for namespace_id (${namespace.id}), name (${efName}).`)
        exit(1)
    }

    if (args && typeof args === 'string') {
        args = JSON.parse(args)
    }

    logger.info(`Creating edge_function_version ${nsp}.${efvName}@${version}...`)
    await createEdgeFunctionVersion(nsp, edgeFunction.id, efvName, version, url, args as object)
    console.log(nsp, edgeFunction.id, efvName, version, url, args)
    logger.info('Success.')
    exit(0)
}

export default perform
