import { Queue, Worker, Job } from 'bullmq'
import config from './config'
import { logger, setProcessEventSorterJobs, shouldProcessEventSorterJobs } from '../../shared'
import perform from './job'
import chalk from 'chalk'

const queueKey = [config.BLOCK_EVENTS_QUEUE_PREFIX, config.CHAIN_ID].join('-')

let queue: Queue
export async function reenqueueJob(blockNumber: number) {   
    queue = queue || new Queue(queueKey, {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
        defaultJobOptions: {
            attempts: config.SORT_BLOCK_EVENTS_JOB_MAX_ATTEMPTS,
            removeOnComplete: true,
            removeOnFail: 50,
            backoff: {
                type: 'fixed',
                delay: config.JOB_DELAY_ON_FAILURE,
            },
        },
    })
    await queue.add(config.SORT_BLOCK_EVENTS_JOB_NAME, { blockNumber }, {
        priority: blockNumber,
    })
}

export function getWorker(): Worker {
    let worker: Worker
    worker = new Worker(
        queueKey,
        async (j: Job) => {
            const { blockNumber } = j.data || {}
            const chainId = config.CHAIN_ID
            let reEnqueue = false
            try {
                await perform(j.data)
            } catch (err) {
                await setProcessEventSorterJobs(chainId, false)
                reEnqueue = true
                logger.error(`[${chainId}:${blockNumber}] ${chalk.redBright('Event sorter job failed:')} ${err}`)
            }

            if (!(await shouldProcessEventSorterJobs(chainId))) {
                logger.info(chalk.magenta(`[${chainId}:${blockNumber}] Pausing worker.`))
                worker.pause()
            }

            if (reEnqueue) {
                logger.info(chalk.magenta(`[${chainId}:${blockNumber}] Re-enqueueing job to be picked up on next deployment.`))
                await reenqueueJob(blockNumber)
            }
        },
        {
            autorun: false,
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            },
            concurrency: 1,
        }
    )

    worker.on('failed', async (job, err) => {
        const { blockNumber } = job.data || {}
        const chainId = config.CHAIN_ID
        logger.error(`[${chainId}:${blockNumber}] ${chalk.redBright('Event sorter job failed:')} ${err}`)
        logger.error(`[${chainId}:${blockNumber}] ${chalk.magenta('Pausing worker & re-enqueueing job for next deployment.')}`)
        await setProcessEventSorterJobs(chainId, false)
        worker.pause()
        await reenqueueJob(blockNumber)
    })

    worker.on('error', (err) => {
        logger.error(`[${config.CHAIN_ID}] Event sorter worker error: ${err}.`)
    })

    return worker
}
