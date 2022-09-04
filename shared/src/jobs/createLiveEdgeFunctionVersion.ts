import { createLiveEdgeFunctionVersion } from '../lib/core/db/services/liveEdgeFunctionVersionServices'
import { getLiveObjectVersionsByNamespacedVersions } from '../lib/core/db/services/liveObjectVersionServices'
import { getEdgeFunctionVersion } from '../lib/core/db/services/edgeFunctionVersionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { LiveEdgeFunctionVersionRole } from '../lib/core/db/entities/LiveEdgeFunctionVersion'

async function perform(
    lov: string,
    efv: string,
    role: LiveEdgeFunctionVersionRole,
    argsMap?: object,
    metadata?: object
) {
    await CoreDB.initialize()

    const liveObjectVersion = (await getLiveObjectVersionsByNamespacedVersions([lov]))[0]
    if (!liveObjectVersion) {
        logger.error(`No live object versions: ${lov}`)
        exit(1)
    }

    const [nspName, version] = efv.split('@')
    const [nsp, name] = nspName.split('.')
    const edgeFunctionVersion = await getEdgeFunctionVersion(nsp, name, version)
    if (!edgeFunctionVersion) {
        logger.error(
            `No edge_function_version for nsp (${nsp}), name (${name}), version (${version}).`
        )
        exit(1)
    }

    logger.info(`Creating live_edge_function_version ${nsp}.${name}@${version}...`)
    await createLiveEdgeFunctionVersion(
        liveObjectVersion.id,
        edgeFunctionVersion.id,
        role,
        argsMap,
        metadata
    )
    logger.info('Success.')
    exit(0)
}

export default perform
