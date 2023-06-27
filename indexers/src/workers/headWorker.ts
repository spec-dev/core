import { Queue, Worker, Job } from 'bullmq'
import config from '../config'
import {
    logger,
    NewReportedHead,
    setIndexedBlockStatus,
    IndexedBlockStatus,
    sleep,
    shouldProcessIndexJobs,
    setProcessIndexJobs,
    randomIntegerInRange,
} from '../../../shared'
import chalk from 'chalk'
import { getIndexer } from '../indexers'
import { teardownRpcPool, createRpcPool, hasHitMaxCalls } from '../rpcPool'

let queue: Queue
export async function reenqueueJob(head: NewReportedHead) {   
    queue = queue || new Queue(config.HEAD_REPORTER_QUEUE_KEY, {
        connection: {
            host: config.INDEXER_REDIS_HOST,
            port: config.INDEXER_REDIS_PORT,
        },
        defaultJobOptions: {
            attempts: config.INDEX_JOB_MAX_ATTEMPTS,
            removeOnComplete: true,
            removeOnFail: 50,
            backoff: {
                type: 'fixed',
                delay: config.JOB_DELAY_ON_FAILURE,
            },
        },
    })
    await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
        priority: head.blockNumber,
    })
}

let numIterations = 0
let worker: Worker
async function runJob(job: Job) {
    numIterations++
    const head = job.data as NewReportedHead
    const jobStatusUpdatePromise = setIndexedBlockStatus(
        head.id,
        IndexedBlockStatus.Indexing
    )

    let reIndex = false
    let attempt = 1
    let indexer = null
    let timer = null
    let timeout = null
    let triedToRebuildRpcPoolAsFix = false
    while (attempt < config.INDEX_PERFORM_MAX_ATTEMPTS) {
        // Get proper indexer based on head's chain id.
        indexer = getIndexer(head)
        if (!indexer) {
            throw `No indexer exists for chainId: ${head.chainId}`
        }

        // Set max job timeout timer.
        timeout = async () => {
            await new Promise((res) => {
                timer = setTimeout(res, config.INDEX_PERFORM_MAX_DURATION) 
                return timer
            })
            if (indexer.saving) {
                await new Promise((res) => {
                    timer = setTimeout(res, config.INDEX_PERFORM_MAX_DURATION) 
                    return timer
                })
            }
            throw new Error(`[${head.chainId}:${head.blockNumber}] Index job max duration reached.`)
        }
        
        // BullMQ for whatever fucking reason doesn't have a 
        // "max job timeout" so we have to hack this manually.
        try {
            await Promise.race([indexer.perform(), timeout()])
            indexer.timedOut = true
            break
        } catch (err) {
            indexer.timedOut = true
            indexer = null
            attempt++
            timer && clearTimeout(timer)
            timer = null
            timeout = null
            // When all attempts are exhausted, flip the master switch for index jobs 
            // to false, telling all other (potential) parallel index workers to pause.
            if (attempt >= config.INDEX_PERFORM_MAX_ATTEMPTS) {
                await setProcessIndexJobs(head.chainId, false)
                reIndex = true
                logger.error(`[${head.chainId}:${head.blockNumber}] ${chalk.redBright('All attempts exhausted.')}`)
                break
            }

            if (!(await shouldProcessIndexJobs(head.chainId))) {
                reIndex = true
                logger.error(`[${head.chainId}:${head.blockNumber}] ${chalk.magenta('Gracefully shutting down. Stopping retries.')}`)
                break
            }

            logger.error(`${chalk.redBright(err)} - Retrying with attempt ${attempt}/${config.INDEX_PERFORM_MAX_ATTEMPTS}`)

            if (attempt > 2 && !triedToRebuildRpcPoolAsFix) {
                triedToRebuildRpcPoolAsFix = true
                numIterations = 0
                teardownRpcPool()
                await sleep(50)
                createRpcPool()
            }

            await sleep(randomIntegerInRange(
                Math.floor(0.8 * config.JOB_DELAY_ON_FAILURE),
                Math.floor(1.2 * config.JOB_DELAY_ON_FAILURE),
            ))
            continue
        }
    }
    timer && clearTimeout(timer)
    timer = null
    indexer = null
    timeout = null

    await jobStatusUpdatePromise

    if (!(await shouldProcessIndexJobs(head.chainId))) {
        logger.notify(chalk.magenta(`[${head.chainId}:${head.blockNumber}] Pausing worker.`))
        worker.pause()
        await sleep(5)
    }

    if (reIndex) {
        logger.notify(chalk.magenta(`[${head.chainId}:${head.blockNumber}] Re-enqueueing head to be picked up by next deployment.`))
        await reenqueueJob(head)
    }
    
    if (numIterations >= config.MAX_RPC_POOL_BLOCK_ITERATIONS || hasHitMaxCalls()) {
        numIterations = 0
        teardownRpcPool()
        await sleep(50)
        createRpcPool()
        await sleep(50)
    }
}

export function getHeadWorker(): Worker {
    worker = new Worker(
        config.HEAD_REPORTER_QUEUE_KEY,
        runJob,
        {
            autorun: false,
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT, 
            },
            concurrency: config.HEAD_JOB_CONCURRENCY_LIMIT,
            lockDuration: config.INDEX_JOB_LOCK_DURATION,
        }
    )

    worker.on('completed', async (job) => {
        const head = job.data as NewReportedHead
        await setIndexedBlockStatus(head.id, IndexedBlockStatus.Complete)
    })

    worker.on('failed', async (job, err) => {
        const head = job.data as NewReportedHead
        logger.error(
            `[${head.chainId}:${head.blockNumber}] ${chalk.redBright('Index block job failed: ')} ${JSON.stringify(err)}.`
        )
        logger.notify(chalk.magenta(`[${head.chainId}:${head.blockNumber}] Pausing worker & reenqueing job to be picked up by next deployment.`))
        await setProcessIndexJobs(head.chainId, false)
        worker.pause()
        await sleep(5)
        await reenqueueJob(head)
    })

    worker.on('error', (err) => {
        logger.error(`${chalk.red('Indexer worker error:')} ${JSON.stringify(err)}.`)
    })

    return worker
}