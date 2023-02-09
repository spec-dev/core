import { logger, CoreDB, updateLiveObjectVersionStatus, LiveObjectVersionStatus, SharedTables } from '../../shared'
import LovIndexer from './LovIndexer'
import config from './config'
import { exit } from 'process'

async function run() {
    await Promise.all([
        CoreDB.initialize(),
        SharedTables.initialize(),
    ])

    logger.info('Starting live object indexer...')

    const id = config.LIVE_OBJECT_VERSION_ID
    if (!id) throw 'No live object version id set in config.'

    try {
        const indexer = new LovIndexer(id)
        await indexer.run()
    } catch (err) {
        logger.error(`Indexing live object version (id=${id}) failed:`, err)
        await updateLiveObjectVersionStatus(id, LiveObjectVersionStatus.Failing)
        exit(1)
    }
    exit(0)
}

run()