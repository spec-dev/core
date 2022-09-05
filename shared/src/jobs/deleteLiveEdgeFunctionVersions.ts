import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { LiveEdgeFunctionVersion } from '../lib/core/db/entities/LiveEdgeFunctionVersion'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const repo = CoreDB.getRepository(LiveEdgeFunctionVersion)
    await repo.createQueryBuilder().delete().from(LiveEdgeFunctionVersion).execute()
    logger.info('Success')
    exit(0)
}

export default perform
