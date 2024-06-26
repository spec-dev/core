import config from './config'
import {
    logger,
    indexerRedis,
    IndexerDB,
    SharedTables,
    CoreDB,
    abiRedis,
    coreRedis,
    ChainTables,
} from '../../shared'
import { getWorker } from './workers'

async function run() {
    // Start all databases.
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
        ChainTables.initialize(),
        CoreDB.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
        coreRedis.connect(),
    ])

    logger.info(
        config.IS_RANGE_MODE
            ? `Indexing block range ${config.FROM} -> ${config.TO}...`
            : `Listening for new block heads on chain ${config.CHAIN_ID}...`
    )

    const worker = await getWorker()
    worker?.run()
}

run()
