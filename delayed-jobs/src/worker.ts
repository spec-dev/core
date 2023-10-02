import { Worker, Job } from 'bullmq'
import config from './config'
import { logger, DelayedJobSpec } from '../../shared'
import { getJob } from './jobs'
import chalk from 'chalk'

export function getWorker(): Worker {
    const worker = new Worker(
        config.DELAYED_JOB_QUEUE_KEY,
        async (j: Job) => {
            const jobSpec = j.data as DelayedJobSpec
            const job = getJob(jobSpec)
            if (!job) throw `No job exists for name: ${jobSpec?.name}`
            await job.perform()
        },
        {
            autorun: false,
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            },
            concurrency: config.DELAYED_JOB_CONCURRENCY_LIMIT,
            lockDuration: 60000,
        }
    )

    worker.on('completed', async (job) => {
        const jobSpec = job.data as DelayedJobSpec
        logger.info(chalk.greenBright(`Successfully performed delayed job ${jobSpec.name}.`))
    })

    worker.on('failed', async (job, err) => {
        const jobSpec = job.data as DelayedJobSpec
        logger.error(chalk.redBright(`Delayed job ${jobSpec.name} failed -- ${err}.`))
    })

    worker.on('error', (err) => {
        logger.error(chalk.redBright(`Delayed job worker error: ${err}.`))
    })

    return worker
}
