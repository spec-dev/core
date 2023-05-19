import { Queue } from 'bullmq'
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
        removeOnComplete: true,
        removeOnFail: 50,
        backoff: {
            type: 'fixed',
            delay: config.JOB_DELAY_ON_FAILURE,
        },
    },
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
        try {
            const jobAlreadyWaiting = (await queue.getWaiting()).find(job => (
                job?.data?.blockNumber === head.blockNumber
            ))
            if (jobAlreadyWaiting) {
                logger.notify(chalk.yellow(`Replacing job for block ${head.blockNumber}`))
                await jobAlreadyWaiting.remove()
            }
        } catch (err) {
            logger.error(`Error finding/replacing waiting jobs`, err)
        }

        const logMethod = replace ? 'notify' : 'info'
        const logColor = replace ? 'green' : 'cyanBright'
        logger[logMethod](chalk[logColor](
            `Enqueueing block ${head.blockNumber} for indexing (${head.blockHash?.slice(0, 10)})`
        ))
        
        await sleep(10)
        await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
            priority: head.blockNumber,
        })
    }
}
