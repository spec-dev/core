import { getEdgeFunctions } from '../lib/core/db/services/edgeFunctionServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const edgeFuntions = await getEdgeFunctions()
    for (let ef of edgeFuntions) {
        logger.info(ef)
    }
    exit(0)
}

export default perform
