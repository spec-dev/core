import { Queue, Worker, Job } from 'bullmq'
import config from './config'
import { logger, setProcessEventGenJobs, shouldProcessEventGenJobs, StringKeyMap } from '../../shared'
import perform from './job'
import chalk from 'chalk'

const queueKey = [config.EVENT_GENERATOR_QUEUE_PREFIX, config.CHAIN_ID].join('-')

let queue: Queue
export async function reenqueueJob(blockNumber: number, data: StringKeyMap) {   
    queue = queue || new Queue(queueKey, {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
        defaultJobOptions: {
            attempts: config.EVENT_GENERATOR_JOB_MAX_ATTEMPTS,
            removeOnComplete: true,
            removeOnFail: 10,
            backoff: {
                type: 'fixed',
                delay: config.JOB_DELAY_ON_FAILURE,
            },
        },
    })
    await queue.add(config.EVENT_GENERATOR_JOB_NAME, data, {
        priority: blockNumber,
    })
}

export function getWorker(): Worker {
    let worker: Worker
    worker = new Worker(
        queueKey,
        async (job: Job) => {
            const blockNumber = Number(job.data.blockNumber)
            const chainId = config.CHAIN_ID
            let reEnqueue = false
            try {
                await perform(job.data)
            } catch (err) {
                await setProcessEventGenJobs(chainId, false)
                reEnqueue = true
                logger.error(`[${chainId}:${blockNumber}] ${chalk.redBright('Event generator job failed:')} ${err}`)
            }

            if (!(await shouldProcessEventGenJobs(chainId))) {
                logger.info(chalk.magenta(`[${chainId}:${blockNumber}] Pausing worker.`))
                worker.pause()
            }

            if (reEnqueue) {
                logger.info(chalk.magenta(`[${chainId}:${blockNumber}] Re-enqueueing job to be picked up on next deployment.`))
                await reenqueueJob(blockNumber, job.data)
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
        logger.error(`[${chainId}:${blockNumber}] ${chalk.redBright('Event generator job failed:')} ${err}`)
        logger.error(`[${chainId}:${blockNumber}] ${chalk.magenta('Pausing worker & re-enqueueing job for next deployment.')}`)
        await setProcessEventGenJobs(chainId, false)
        worker.pause()
        await reenqueueJob(Number(blockNumber), job.data)

    })

    worker.on('error', (err) => {
        logger.error(`[${config.CHAIN_ID}] Event generator worker error: ${err}.`)
    })

    return worker
}