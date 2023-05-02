import config from './config'
import { CoreDB, IndexerDB, indexerRedis, SharedTables } from '../../shared'
import { EvmReporter } from './reporters'

async function listen() {
    await Promise.all([
        CoreDB.initialize(),
        SharedTables.initialize(),
        IndexerDB.initialize(),
        indexerRedis.connect(),
    ])
    const reporter = new EvmReporter(config.CHAIN_ID)
    reporter.listen()
}

listen()