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
    canBlockBeOperatedOn,
} from '../../../shared'
import chalk from 'chalk'
import { getIndexer } from '../indexers'
import { 
    createWsProviderPool, 
    rotateWsProviderGroups,
    teardownWsProviderPool,
    hasHitMaxCalls,
} from '../wsProviderPool'
import { 
    createWeb3Provider, 
    rotateWeb3Provider,
    teardownWeb3Provider,
    resetNumInternalGroupRotations,
} from '../httpProviderPool'

let queue: Queue

function initQueue() {
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
}

async function reenqueueJob(head: NewReportedHead) {   
    initQueue()
    await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
        priority: head.blockNumber,
    })
}

async function isJobWaitingWithBlockNumber(blockNumber: number): Promise<boolean> {
    try {
        initQueue()
        const jobAlreadyWaiting = !!(await queue.getWaiting()).find(job => (
            job?.data?.blockNumber === blockNumber
        ))
        return jobAlreadyWaiting
    } catch (err) {
        logger.error(`Error checking queue for head with block number ${blockNumber}`, err)
        return false
    }
}

let numIterationsWithCurrentWsProvider = 0
let worker: Worker
async function runJob(job: Job) {
    numIterationsWithCurrentWsProvider++
    const head = job.data as NewReportedHead
    const jobStatusUpdatePromise = setIndexedBlockStatus(
        head.id,
        IndexedBlockStatus.Indexing
    )

    let reIndex = false
    let attempt = 1
    let numFailuresWithCurrentHttpProvider = 0
    let numFailuresWithCurrentWsProvider = 0
    let indexer = null
    let timer = null
    let timeout = null
    let removedHash = false

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
            const didFetchPrimitives = indexer.didFetchPrimitives
            const reorgDetectedViaLogs = indexer.reorgDetectedViaLogs
            indexer.timedOut = true
            indexer = null
            attempt++
            timer && clearTimeout(timer)
            timer = null
            timeout = null

            if (!(await canBlockBeOperatedOn(head.chainId, head.blockNumber))) {
                logger.warn(chalk.yellow(`[${head.chainId}:${head.blockNumber}] Job stopped mid-indexing.`))
                break
            }

            if ((await isJobWaitingWithBlockNumber(head.blockNumber))) {
                logger.warn(chalk.yellow(`[${head.chainId}:${head.blockNumber}] Stopping retries to replace job.`))
                break
            }

            // Use block number instead of block hash for indexing if either...
            // a) the logs indicated a reorg, since we 100% fetch logs by block hash
            // b) N failures have occurred
            if (!removedHash && (reorgDetectedViaLogs || attempt > config.MAX_ATTEMPTS_BEFORE_HASH_REMOVAL)) {
                removedHash = true
                logger.warn(chalk.yellow(`[${head.chainId}:${head.blockNumber}] Fetching by number next time...`))
                head.blockHash = null
            }
            
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

            if (didFetchPrimitives) {
                // Websocket provider rotation.
                numFailuresWithCurrentWsProvider++
                if (numFailuresWithCurrentWsProvider > config.MAX_ATTEMPTS_BEFORE_ROTATION) {
                    numFailuresWithCurrentWsProvider = 0
                    numIterationsWithCurrentWsProvider = 0
                    teardownWsProviderPool()
                    await sleep(50)
                    rotateWsProviderGroups()
                    createWsProviderPool()
                }
            } else {
                // HTTP provider rotation.
                numFailuresWithCurrentHttpProvider++
                if (numFailuresWithCurrentHttpProvider > config.MAX_ATTEMPTS_BEFORE_ROTATION) {
                    numFailuresWithCurrentHttpProvider = 0
                    teardownWeb3Provider()
                    await sleep(50)
                    rotateWeb3Provider()
                    createWeb3Provider()
                }
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
    resetNumInternalGroupRotations()

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
    
    if (numIterationsWithCurrentWsProvider >= config.MAX_RPC_POOL_BLOCK_ITERATIONS || hasHitMaxCalls()) {
        numIterationsWithCurrentWsProvider = 0
        teardownWsProviderPool()
        await sleep(50)
        createWsProviderPool()
        await sleep(50)
    }
}

export function getHeadWorker(): Worker {
    createWeb3Provider()
    createWsProviderPool()

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