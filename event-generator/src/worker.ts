import { Worker, Job } from 'bullmq'
import config from './config'
import { logger, isEventGeneratorPaused, pauseEventGenerator } from '../../shared'
import perform from './job'
import chalk from 'chalk'

export function getWorker(): Worker {
    let worker: Worker
    worker = new Worker(
        [config.EVENT_GENERATOR_QUEUE_PREFIX, config.CHAIN_ID].join('-'),
        async (j: Job) => {
            await perform(j.data)
            if (await isEventGeneratorPaused(config.CHAIN_ID)) {
                await pauseEventGenerator(config.CHAIN_ID)
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

    worker.on('paused', () => {
        logger.info(chalk.yellow('Event generator paused.'))
    })

    worker.on('failed', async (job, err) => {
        logger.error(`[${config.CHAIN_ID}:${job.data?.blockNumber}] Event generator job failed`, err)
    })

    worker.on('error', (err) => {
        logger.error(`[${config.CHAIN_ID}] Event generator worker error: ${err}.`)
    })

    return worker
}