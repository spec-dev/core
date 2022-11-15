import { getEdgeFunctionVersion, setEdgeFunctionVersionUrl } from '../lib/core/db/services/edgeFunctionVersionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(
    nsp: any,
    name: string,
    version: string,
    url: string,
) {
    await CoreDB.initialize()

    const edgeFunctionVersion = await getEdgeFunctionVersion(nsp, name, version)
    if (!edgeFunctionVersion) {
        logger.error(`No edge_function_version found for ${nsp}.${name}@${version}`)
        exit(1)
    }

    logger.info(`Setting url for edge function version ${nsp}.${name}@${version} to ${url}...`)
    await setEdgeFunctionVersionUrl(edgeFunctionVersion.id, url)
    logger.info('Success.')
    exit(0)
}

export default perform
