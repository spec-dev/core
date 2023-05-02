import { Queue, QueueScheduler } from 'bullmq'
import config from './config'
import { IndexedBlock, logger, NewReportedHead, sleep, range, createIndexedBlock } from '../../shared'
import chalk from 'chalk'

// Queue for reporting new block heads to our indexers.
const queue = new Queue(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    },
    defaultJobOptions: {
        attempts: config.INDEX_JOB_MAX_ATTEMPTS,
        backoff: {
            type: 'fixed',
            delay: 2000,
        },
    },
})

const queueScheduler = new QueueScheduler(config.HEAD_REPORTER_QUEUE_KEY, {
    connection: {
        host: config.INDEXER_REDIS_HOST,
        port: config.INDEXER_REDIS_PORT,
    }
})

let series = null

export async function reportBlock(block: IndexedBlock, replace: boolean) {
    const { id, chainId, number, hash } = block
    const data: NewReportedHead = {
        id,
        chainId: chainId.toString(),
        blockNumber: Number(number),
        blockHash: hash,
        replace,
        force: config.FORCE_REINDEX,
    }

    const heads = []
    if (series !== null && data.blockNumber - series > 1) {
        logger.error(chalk.red(`Gap prevented within block reporting (${series} -> ${data.blockNumber})`))
        const gapNumbers = range(series + 1, data.blockNumber - 1)
        const missingIndexedBlocks = await Promise.all(gapNumbers.map(n => createIndexedBlock({ 
            chainId: Number(chainId), 
            number: n, 
            hash: null,
        })))
        heads.push(...missingIndexedBlocks.map(ib => ({
            id: ib.id,
            chainId: ib.chainId.toString(),
            blockNumber: Number(ib.number),
            blockHash: ib.hash,
            replace: false,
            force: config.FORCE_REINDEX,
        })))
    }

    heads.push(data)
    series = data.blockNumber

    for (const head of heads) {
        logger.info(chalk.cyanBright(
            `Enqueueing block ${head.blockNumber} for indexing (${head.blockHash?.slice(0, 10)})`
        ))
        await sleep(10)
        await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
            priority: head.blockNumber,
            removeOnComplete: true,
            removeOnFail: 10,
        })
    }
}
