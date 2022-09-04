import { getEdgeFunctionVersions } from '../lib/core/db/services/edgeFunctionVersionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const edgeFuntionVersions = await getEdgeFunctionVersions()
    for (let efv of edgeFuntionVersions) {
        logger.info(efv)
    }
    exit(0)
}

export default perform
