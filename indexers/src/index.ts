import config from './config'
import {
    logger,
    indexerRedis,
    IndexerDB,
    SharedTables,
    CoreDB,
    upsertContractCaches,
} from '../../shared'
import { getWorker } from './workers'

async function run() {
    // Start all databases.
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
        CoreDB.initialize(),
        indexerRedis.connect(),
    ])

    // Make sure verified contracts and instances are cached.
    await upsertContractCaches()

    logger.info(
        config.IS_RANGE_MODE
            ? `Indexing block range ${config.FROM_BLOCK} -> ${config.TO_BLOCK}...`
            : `Listening for new block heads...`
    )

    // Start dat bish.
    getWorker().run()
}

run()
