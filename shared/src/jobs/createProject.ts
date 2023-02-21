import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { createProject } from '../lib/core/db/services/projectServices'
import { indexerRedis } from '..'
import { Queue, QueueEvents } from 'bullmq'
import config from '../lib/config'

async function perform() {
    await indexerRedis.connect()
    // await indexerRedis.del('block-events-series-137')
    // await indexerRedis.del('block-events-skipped-blocks-137')
    // await indexerRedis.del('block-events-eager-blocks-137')

    const queue = new Queue('block-events-queue-137', {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })
    const counts = await queue.getJobCounts('wait', 'completed', 'failed');
    console.log(counts)

    await queue.resume()

    // await queue.obliterate()

    const queue2 = new Queue('event-gen-queue-137', {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
    })
    await queue2.resume()
    // await queue2.obliterate()

    // logger.info(`Creating project ${name}...`)
    // const project = await createProject(name, Number(orgId))

    // if (!project) {
    //     logger.info('Failed.')
    //     exit(0)
    // }

    logger.info(`Success.`)
    exit(0)
}

export default perform
