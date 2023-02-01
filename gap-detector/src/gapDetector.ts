import config from './config'
import createSubscriber, { Subscriber } from 'pg-listen'
import { NewBlockEvent } from './types'
import { sleep, logger, NewReportedHead, IndexedBlock, IndexedBlockStatus, insertIndexedBlocks, getFailedIds, resetIndexedBlocks } from '../../shared'
import { Queue, QueueScheduler } from 'bullmq'
import { queueNameForChainId } from './utils/queues'
import { gapTolerances, checkInTolerances } from './utils/tolerances'

class GapDetector {

    chains: string[]

    pgListener: Subscriber

    checkInTimers: { [key: string]: any } = {}

    lastSeenBlock: { [key: string]: number } = {}

    missingBlocks: { [key: string]: Set<number> } = {}

    reenqueuedBlocks: { [key: string]: any } = {}

    queues: { [key: string]: Queue } = {}

    queueSchedulers: { [key: string]: QueueScheduler } = {}

    constructor(chains: string[]) {
        this.chains = chains
        this.chains.forEach(chainId => {
            this.reenqueuedBlocks[chainId] = {}
        })
        this.pgListener = createSubscriber({
            host: config.SHARED_TABLES_DB_HOST,
            port: config.SHARED_TABLES_DB_PORT,
            user: config.SHARED_TABLES_DB_USERNAME,
            password: config.SHARED_TABLES_DB_PASSWORD,
            database: config.SHARED_TABLES_DB_NAME,
        })
    }

    async run() {
        this.chains.forEach(chainId => {
            this.pgListener.notifications.on(this._chainChannel(chainId), e => this._onNewBlock(e, chainId))
        })

        setInterval(() => this._monitorReenqueuedBlocks(), 20000)
        try {
            await this.pgListener.connect()
            await Promise.all(this.chains.map(chainId => this.pgListener.listenTo(this._chainChannel(chainId))))
        } catch (err) {
            logger.error(`Error connecting to new block notification channels: ${err}`)
        }
    }

    async _onNewBlock(event: NewBlockEvent, chainId: string) {
        if (!event || !event.number || !this.chains.includes(chainId)) return

        this._resetCheckInTimer(chainId)
        const newBlockNumber = Number(event.number)

        if (this.reenqueuedBlocks[chainId].hasOwnProperty(newBlockNumber)) {
            logger.info(`[${chainId}] ${newBlockNumber} recovered successfully.`)
            delete this.reenqueuedBlocks[chainId][newBlockNumber]
        }

        this.missingBlocks[chainId] = this.missingBlocks[chainId] || new Set()
        if (this.missingBlocks[chainId].has(newBlockNumber)) {
            this.missingBlocks[chainId].delete(newBlockNumber)
        }

        const lastSeenBlock = this.lastSeenBlock[chainId] || newBlockNumber
        if (newBlockNumber > lastSeenBlock + 1) {
            this._findGapInBlocks([lastSeenBlock, newBlockNumber]).forEach(
                number => this.missingBlocks[chainId].add(number)
            )
        }
        this.lastSeenBlock[chainId] = Math.max(lastSeenBlock, newBlockNumber)

        const gapTolerance = gapTolerances[chainId] || 5
        const numbersToReenqueue = []
        for (const number of this._sortInts(Array.from(this.missingBlocks[chainId]))) {
            if (this.lastSeenBlock[chainId] - number >= gapTolerance) {
                numbersToReenqueue.push(number)
                this.missingBlocks[chainId].delete(number)
            }
        }
        if (!numbersToReenqueue.length) return

        const indexedBlocks = await this._upsertIndexedBlocks(numbersToReenqueue, chainId)
        if (!indexedBlocks.length) {
            logger.error(`Can't re-enqueue blocks without indexed_block instances.`)
            return
        }

        await this._reenqueueBlocks(indexedBlocks)
    }

    _findGapInBlocks(sortedNumbers: number[]): number[] {
        if (sortedNumbers.length < 2) return []
        const missing = []
        const min = sortedNumbers[0]
        const max = sortedNumbers[sortedNumbers.length - 1]
        for (let i = min + 1; i < max; i++) {
            if (!sortedNumbers.includes(i)) {
                missing.push(i)
            }
        }
        return missing
    }
    
    _resetCheckInTimer(chainId: string) {
        const requiredCheckInTime = checkInTolerances[chainId] || 60000
        this.checkInTimers[chainId] && clearInterval(this.checkInTimers[chainId])
        this.checkInTimers[chainId] = setInterval(() => {
            logger.error(
                `No new block on chain ${chainId} in the last ${requiredCheckInTime / 1000}s. ` + 
                `Last seen block - ${this.lastSeenBlock[chainId]}`
            )
        }, requiredCheckInTime)
    }

    async _upsertIndexedBlocks(numbers: number[], chainId: string): Promise<IndexedBlock[]> {
        const inserts = numbers.map(number => ({
            chainId: Number(chainId),
            number,
            hash: null,
            status: IndexedBlockStatus.Pending,
            failed: false,
        }))

        let indexedBlocks = []
        try {
            indexedBlocks = await insertIndexedBlocks(inserts)
        } catch (err) {
            logger.error(`Error upserting indexed blocks with numbers ${numbers.join(', ')}: ${err}`)
            return []
        }

        return indexedBlocks as IndexedBlock[]
    }

    async _reenqueueBlocks(indexedBlocks: IndexedBlock[]) {
        try {
            for (const indexedBlock of indexedBlocks) {
                this.reenqueuedBlocks[indexedBlock.chainId.toString()][Number(indexedBlock.number)] = indexedBlock
                await this._enqueueBlock(indexedBlock)
                await sleep(100)
            }
        } catch (err) {
            logger.error(
                `Error re-enqueuing blocks ${indexedBlocks.map(b => b.number).join(', ')}: ${err}`
            )
        }
    }

    async _enqueueBlock(indexedBlock: IndexedBlock) {
        const { id, number, hash } = indexedBlock
        const chainId = indexedBlock.chainId.toString()
        const data: NewReportedHead = {
            id,
            chainId,
            blockNumber: Number(number),
            blockHash: hash,
            replace: false,
            force: false,
        }

        logger.info(`[${chainId}] Enqueueing missing block ${number}...`)

        this._upsertQueue(chainId)
        const queue = this.queues[chainId]
        if (!queue) {
            logger.error(`No queue exists for chainId ${chainId}.`)
            return
        }

        await queue.add(config.INDEX_BLOCK_JOB_NAME, data, {
            removeOnComplete: true,
            removeOnFail: 10,
        })
    }

    _upsertQueue(chainId: string) {
        const queueName = queueNameForChainId[chainId]
        if (!queueName) {
            logger.error(`No queue name registered for chainId ${chainId}`)
            return
        }
        this.queues[chainId] = this.queues[chainId] || new Queue(queueName, {
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            },
            defaultJobOptions: {
                attempts: 60,
                backoff: {
                    type: 'fixed',
                    delay: 2000,
                },
            },
        })
        this.queueSchedulers[chainId] = this.queueSchedulers[chainId] || new QueueScheduler(queueName, {
            connection: {
                host: config.INDEXER_REDIS_HOST,
                port: config.INDEXER_REDIS_PORT,
            }
        })
    }

    async _monitorReenqueuedBlocks() {
        // Get all reenqueued indexed block ids.
        const indexedBlockIds = []
        for (const chainId in this.reenqueuedBlocks) {
            const chainReenqueuedBlocks = this.reenqueuedBlocks[chainId] || {}
            for (const number in chainReenqueuedBlocks) {
                const indexedBlock = chainReenqueuedBlocks[number]
                indexedBlockIds.push(indexedBlock.id)
            }
        }
        if (!indexedBlockIds.length) return

        // Find if any have been flagged as failed.
        const failedIds = await getFailedIds(indexedBlockIds)
        if (!failedIds?.length) return

        // Reset/reenqueue them again.
        const resetEntries = await resetIndexedBlocks(failedIds)
        for (const indexedBlock of resetEntries) {
            logger.error(`${[indexedBlock.chainId]}: Reenqueuing failed indexed block ${indexedBlock.number}`)
        }
        await this._reenqueueBlocks(resetEntries)
    }
 
    _sortInts(arr: number[]): number[] {
        return arr.sort((a, b) => a - b)
    }

    _chainChannel(chainId: string): string {
        return config.NEW_BLOCK_CHANNEL_PREFIX + chainId
    }
}

export default GapDetector