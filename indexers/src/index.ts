import config from './config'
import {
    logger,
    indexerRedis,
    IndexerDB,
    SharedTables,
    CoreDB,
    upsertContractCaches,
    abiRedis,
} from '../../shared'
import { getWorker } from './workers'

async function run() {
    // Start all databases.
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
        CoreDB.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
    ])

    // // Make sure verified contracts and instances are cached.
    await upsertContractCaches()

    logger.info(
        config.IS_RANGE_MODE
            ? `Indexing block range ${config.FROM} -> ${config.TO}...`
            : `Listening for new block heads...`
    )

    const worker = await getWorker()
    worker.run()
}

run()
