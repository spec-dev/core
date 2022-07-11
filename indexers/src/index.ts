import { Worker, Job } from 'bullmq'
import config from './config'
import { logger, NewReportedHead, IndexerDB, PublicTables } from 'shared'
import { getIndexer } from './indexers'

const worker = new Worker(config.HEAD_REPORTER_QUEUE_KEY, async (job: Job) => {
    const head = job.data as NewReportedHead

    // Get proper indexer based on head's chain id.
    const indexer = getIndexer(head)
    if (!indexer) {
        logger.error(`No indexer exists for chainId: ${head.chainId}`)
        return
    }

    // Index block.
    await indexer.perform()
},  {
    autorun: false,
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

worker.on('completed', job => {
    logger.info(`Successfully completed ${job.name} job ${job.id}.`)
})
  
worker.on('failed', (job, err) => {
    logger.error(`Index block job ${job.id} failed with ${err}.`)
})

worker.on('error', err => {
    logger.error(`Indexer worker error: ${err}.`)
})

async function run() {
    await Promise.all([IndexerDB.initialize(), PublicTables.initialize()])
    logger.info(`Listening for ${config.INDEX_BLOCK_JOB_NAME} jobs...`)
    worker.run()
}

run()