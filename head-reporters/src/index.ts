import config from './config'
import { logger, IndexerDB, indexerRedis, IndexedBlock, IndexedBlockStatus, sleep, insertIndexedBlocks, range } from '../../shared'
import { getReporter } from './reporters'
import  { reportBlock } from './queue'

async function upsertIndexedBlocks(numbers: number[], chainId: string): Promise<IndexedBlock[]> {
    const inserts = numbers.map(number => ({
        chainId: Number(chainId),
        number,
        hash: null,
        status: IndexedBlockStatus.Pending,
        failed: false,
    }))
    let indexedBlocks = []
    try {
        indexedBlocks = await insertIndexedBlocks(inserts)
    } catch (err) {
        logger.error(`Error upserting indexed blocks with numbers ${numbers.join(', ')}: ${err}`)
        return []
    }
    return indexedBlocks as IndexedBlock[]
}

async function listen() {
    await IndexerDB.initialize()
    await indexerRedis.connect()

    if (config.MANUALLY_REPORT_NUMBERS.length) {
        const numbers = range(config.MANUALLY_REPORT_NUMBERS[0], config.MANUALLY_REPORT_NUMBERS[1])
        const indexedBlocks = await upsertIndexedBlocks(numbers, config.CHAIN_ID)
        if (!indexedBlocks.length) {
            logger.error(`Can't re-enqueue blocks without indexed_block instances.`)
            return
        }

        for (const indexedBlock of indexedBlocks) {
            await reportBlock(indexedBlock, false)
            await sleep(1000)
        }
        logger.info('Done.')
        return
    }

    // Get proper reporter for chain id.
    const reporter = getReporter(config.CHAIN_ID)
    if (!reporter) {
        logger.error(`No reporter exists for chainId: ${config.CHAIN_ID}`)
        return
    }

    // Listen and report new heads.
    reporter.listen()
}

listen()