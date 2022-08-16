import { Worker, Job } from 'bullmq'
import config from './config'
import { logger, indexerRedis, NewReportedHead, IndexerDB, SharedTables, setIndexedBlockStatus, setIndexedBlockToFailed, IndexedBlockStatus, CoreDB, upsertContractCaches } from 'shared'
import { getIndexer } from './indexers'

const worker = new Worker(config.HEAD_REPORTER_QUEUE_KEY, async (job: Job) => {
    const head = job.data as NewReportedHead
    const jobStatusUpdatePromise = setIndexedBlockStatus(head.id, IndexedBlockStatus.Indexing)

    // Get proper indexer based on head's chain id.
    const indexer = getIndexer(head)
    if (!indexer) {
        throw `No indexer exists for chainId: ${head.chainId}`
    }

    // Index block.
    await indexer.perform()
    await jobStatusUpdatePromise
},  {
    autorun: false,
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

worker.on('completed', async job => {
    const head = job.data as NewReportedHead
    const { chainId, blockNumber } = head
    await setIndexedBlockStatus(head.id, IndexedBlockStatus.Complete)
    logger.info(`[${chainId}:${blockNumber}] Successfully indexed block ${blockNumber}.`)
})
  
worker.on('failed', async (job, err) => {
    const head = job.data as NewReportedHead
    const { chainId, blockNumber } = head
    await setIndexedBlockToFailed(head.id)
    logger.error(`[${chainId}:${blockNumber}] Index block job ${job.id} failed with ${err}.`)
})

worker.on('error', err => {
    logger.error(`Indexer worker error: ${err}.`)
})

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

    logger.info(`Listening for ${config.INDEX_BLOCK_JOB_NAME} jobs...`)
    worker.run()
}

run()