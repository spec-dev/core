import logger from '../lib/logger'
import { IndexerDB } from '../lib/indexer/db/dataSource'
import { IndexedBlock } from '../lib/indexer/db/entities/IndexedBlock'
import { exit } from 'process'

const indexedBlocks = () => IndexerDB.getRepository(IndexedBlock)

async function perform() {
    await IndexerDB.initialize()
    const failed = await indexedBlocks().find({
        select: { number: true },
        where: { failed: true },
    })
    logger.info(failed)
    exit(0)
}

export default perform
