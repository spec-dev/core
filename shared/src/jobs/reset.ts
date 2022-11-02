import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import {
    LiveEventVersion,
    LiveEdgeFunctionVersion,
    EdgeFunctionVersion,
    EdgeFunction,
    LiveObjectVersion,
    LiveObject,
    EventVersion,
    Event,
    ContractInstance,
    Contract,
} from '../'
import { exit } from 'process'

async function perform() {
    await CoreDB.initialize()
    const repo = CoreDB.getRepository(EdgeFunctionVersion)
    await CoreDB.getRepository(LiveEventVersion)
        .createQueryBuilder()
        .delete()
        .from(LiveEventVersion)
        .execute()
    await CoreDB.getRepository(LiveEdgeFunctionVersion)
        .createQueryBuilder()
        .delete()
        .from(LiveEdgeFunctionVersion)
        .execute()
    await CoreDB.getRepository(EdgeFunctionVersion)
        .createQueryBuilder()
        .delete()
        .from(EdgeFunctionVersion)
        .execute()
    await CoreDB.getRepository(EdgeFunction)
        .createQueryBuilder()
        .delete()
        .from(EdgeFunction)
        .execute()
    await CoreDB.getRepository(LiveObjectVersion)
        .createQueryBuilder()
        .delete()
        .from(LiveObjectVersion)
        .execute()
    await CoreDB.getRepository(LiveObject).createQueryBuilder().delete().from(LiveObject).execute()
    await CoreDB.getRepository(EventVersion)
        .createQueryBuilder()
        .delete()
        .from(EventVersion)
        .execute()
    await CoreDB.getRepository(Event).createQueryBuilder().delete().from(Event).execute()
    await CoreDB.getRepository(ContractInstance)
        .createQueryBuilder()
        .delete()
        .from(ContractInstance)
        .execute()
    await CoreDB.getRepository(Contract).createQueryBuilder().delete().from(Contract).execute()
    logger.info('Success')
    exit(0)
}

export default perform
