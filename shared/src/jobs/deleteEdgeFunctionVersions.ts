import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { EdgeFunctionVersion } from '../lib/core/db/entities/EdgeFunctionVersion'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const repo = CoreDB.getRepository(EdgeFunctionVersion)
    await repo.createQueryBuilder().delete().from(EdgeFunctionVersion).execute()
    logger.info('Success')
    exit(0)
}

export default perform
