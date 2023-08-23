import { exit } from 'process'
import { logger, coreRedis, SharedTables, CoreDB } from '../../shared'
import config from './config'
import path from 'path'
import { dynamicImport } from './utils/imports'

async function run() {
    await Promise.all([
        SharedTables.initialize(),
        coreRedis.connect(),
        CoreDB.initialize(),
    ])

    let job
    try {
        job = (await dynamicImport(path.join(__dirname, 'jobs', config.JOB_NAME))).default
    } catch (err) {
        logger.error(`Failed to import job ${config.JOB_NAME}: ${JSON.stringify(err)}`)
        exit(1)
    }

    if (!job) {
        logger.error(`Couldn't find job ${config.JOB_NAME}.`)
        exit(1)
    }

    logger.info(`Starting job ${config.JOB_NAME}...`)
    await job()
    setInterval(async () => { 
        logger.info(`\n${new Date().toISOString()}`)
        await job()
    }, config.JOB_INTERVAL)
}

run()