import { Worker, Job } from 'bullmq'
import config from '../config'
import {
    logger,
    NewReportedHead,
    setIndexedBlockStatus,
    setIndexedBlockToFailed,
    IndexedBlockStatus,
} from '../../../shared'
import { getIndexer } from '../indexers'

export function getHeadWorker(): Worker {
    const worker = new Worker(
        config.HEAD_REPORTER_QUEUE_KEY,
        async (job: Job) => {
            const head = job.data as NewReportedHead
            const jobStatusUpdatePromise = setIndexedBlockStatus(
                head.id,
                IndexedBlockStatus.Indexing
            )

            if (job.attemptsMade > 1) {
                head.replace = false
                head.blockHash = null
            }

            // Get proper indexer based on head's chain id.
            const indexer = getIndexer(head)
            if (!indexer) {
                throw `No indexer exists for chainId: ${head.chainId}`
            }

            // Index block.
            await indexer.perform()
            await jobStatusUpdatePromise
        },
        {
            autorun: false,
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            },
            concurrency: config.HEAD_JOB_CONCURRENCY_LIMIT,
            lockDuration: 45000,
        }
    )

    worker.on('completed', async (job) => {
        const head = job.data as NewReportedHead
        const { chainId, blockNumber } = head
        await setIndexedBlockStatus(head.id, IndexedBlockStatus.Complete)
        logger.info(`[${chainId}:${blockNumber}] Successfully indexed block ${blockNumber}.`)
    })

    worker.on('failed', async (job, err) => {
        const head = job.data as NewReportedHead
        const { chainId, blockNumber } = head
        await setIndexedBlockToFailed(head.id)
        logger.error(`[${chainId}:${blockNumber}] Index block job failed -- ${err}.`)
    })

    worker.on('error', (err) => {
        logger.error(`Indexer worker error: ${err}.`)
    })

    return worker
}
