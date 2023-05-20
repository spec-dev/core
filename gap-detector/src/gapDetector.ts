import config from './config'
import createSubscriber, { Subscriber } from 'pg-listen'
import { NewBlockEvent } from './types'
import { SharedTables, sleep, logger, NewReportedHead, IndexedBlock, IndexedBlockStatus, insertIndexedBlocks, getFailedIds, resetIndexedBlocks, schemaForChainId, avgBlockTimesForChainId } from '../../shared'
import { Queue, QueueScheduler } from 'bullmq'
import { queueNameForChainId } from './utils/queues'

class GapDetector {

    chains: string[]

    pgListener: Subscriber

    checkInTimers: { [key: string]: any } = {}

    checkInDidTimeout: { [key: string]: boolean } = {}

    lastSeenBlock: { [key: string]: number } = {}

    missingBlocks: { [key: string]: Set<number> } = {}

    reenqueuedBlocks: { [key: string]: any } = {}

    numbersPendingReenqueue: { [key: string]: Set<number> } = {}

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

        setInterval(() => this._monitorReenqueuedBlocks(), config.MONITOR_REQUEUED_BLOCKS_INTERVAL)

        setTimeout(() => {
            for (const chainId of this.chains) {
                this._findGapsWithSeriesGeneration(chainId)
            }
        }, 10000)

        try {
            await this.pgListener.connect()
            await Promise.all(this.chains.map(chainId => this.pgListener.listenTo(this._chainChannel(chainId))))
        } catch (err) {
            logger.error(`Error connecting to new block notification channels: ${err}`)
        }
    }

    async _onNewBlock(event: NewBlockEvent, chainId: string) {
        if (!event || !event.number || !this.chains.includes(chainId)) return

        if (this.checkInDidTimeout[chainId]) {
            logger.notify(`Blocks are back for chain ${chainId} - Got block ${event.number}`)
            this.checkInDidTimeout[chainId] = false
        }

        this._resetCheckInTimer(chainId)
        const newBlockNumber = Number(event.number)

        if (this.numbersPendingReenqueue[chainId] && this.numbersPendingReenqueue[chainId].has(newBlockNumber)) {
            this.numbersPendingReenqueue[chainId].delete(newBlockNumber)
        }

        if (this.reenqueuedBlocks[chainId].hasOwnProperty(newBlockNumber)) {
            logger.notify(`[${chainId}:${new Date().toISOString()}] ${newBlockNumber} recovered successfully.`)
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

        const gapTolerance = config.GAP_TOLERANCE
        const numbersToReenqueue = []
        const missing = this._sortInts(Array.from(this.missingBlocks[chainId]))
        for (const number of missing) {
            if (this.lastSeenBlock[chainId] - number >= gapTolerance) {
                numbersToReenqueue.push(number)
                this.missingBlocks[chainId].delete(number)
            } else {
                logger.info(`[${chainId}] ${missing.length} missing blocks within tolerance: ${missing.join(', ')}`)
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
        const requiredCheckInTime = config.CHECK_IN_TOLERANCE * avgBlockTimesForChainId[chainId] * 1000
        this.checkInTimers[chainId] && clearInterval(this.checkInTimers[chainId])
        this.checkInTimers[chainId] = setInterval(() => {
            logger.error(
                `No new block on chain ${chainId} in the last ${requiredCheckInTime / 1000}s. ` + 
                `Last seen block - ${this.lastSeenBlock[chainId]}`
            )
            this.checkInDidTimeout[chainId] = true
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
                const chainId = indexedBlock.chainId.toString()
                const number = Number(indexedBlock.number)

                this.reenqueuedBlocks[chainId][number] = indexedBlock

                if (this.numbersPendingReenqueue[chainId] && this.numbersPendingReenqueue[chainId].has(number)) {
                    this.numbersPendingReenqueue[chainId].delete(number)
                }

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
        const head: NewReportedHead = {
            id,
            chainId,
            blockNumber: Number(number),
            blockHash: hash,
            replace: false,
            force: false,
        }

        logger.info(`[${chainId}:${new Date().toISOString()}] Enqueueing missing block ${number}...`)

        this._upsertQueue(chainId)
        const queue = this.queues[chainId]
        if (!queue) {
            logger.error(`No queue exists for chainId ${chainId}.`)
            return
        }

        await queue.add(config.INDEX_BLOCK_JOB_NAME, head, {
            priority: head.blockNumber,
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
                attempts: config.INDEX_JOB_MAX_ATTEMPTS,
                removeOnComplete: true,
                removeOnFail: 50,
                backoff: {
                    type: 'fixed',
                    delay: config.JOB_DELAY_ON_FAILURE,
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
            logger.error(`[${[indexedBlock.chainId]}:${new Date().toISOString()}] Reenqueuing failed indexed block ${indexedBlock.number}`)
        }
        await this._reenqueueBlocks(resetEntries)
    }
 
    async _findGapsWithSeriesGeneration(chainId: string) {
        const schema = schemaForChainId[chainId]
        if (!schema) {
            logger.error(`No schema for chainId: ${chainId}`)
            return
        }
        
        // Get largest block number for this chain.
        const largestBlockNumber = await this._getLargestBlockNumberInSchema(schema)
        if (largestBlockNumber === null) {
            logger.error(
                `Finding gaps with series generation failed. ` + 
                `Couldn't find largest block number for in schema ${schema}`
            )
            await sleep(config.SERIES_GEN_INTERVAL)
            this._findGapsWithSeriesGeneration(chainId)
            return
        }

        // See if any of the last 100 blocks are missing.
        const from = Math.max(largestBlockNumber - config.SERIES_GEN_NUMBER_RANGE, 0)
        const to = largestBlockNumber
        const missingNumbers = await this._findMissingBlockNumbersInSeries(schema, from, to)
        if (!missingNumbers?.length) {
            missingNumbers === null && logger.error(
                `Finding gaps with series generation failed. ` + 
                `Couldn't find missing block numbers in series (${from}, ${to}) for schema ${schema}`
            )
            await sleep(config.SERIES_GEN_INTERVAL)
            this._findGapsWithSeriesGeneration(chainId)
            return
        }

        // *****************************************************************
        // NOTE: Your next move if gaps continue should be to use all "missingNumbers" found above rather
        // than filtering those down against this.reenqueuedBlocks[chainId].
        // *****************************************************************

        // Find numbers that haven't already been reenqued by another method.
        const chainReenqueuedBlockNumbers = new Set(
            Object.keys(this.reenqueuedBlocks[chainId] || {}).map(v => Number(v))
        )
        const missingNumbersNotAlreadyReenqueued = missingNumbers.filter(n => !chainReenqueuedBlockNumbers.has(n))
        if (!missingNumbersNotAlreadyReenqueued.length) {
            await sleep(config.SERIES_GEN_INTERVAL)
            this._findGapsWithSeriesGeneration(chainId)
            return
        }

        // Add them to a shared pending object and wait 20sec for other methods 
        // to remove these entries as the blocks appear (potentially).
        this.numbersPendingReenqueue[chainId] = new Set(missingNumbersNotAlreadyReenqueued)
        await sleep(config.SERIES_GEN_INTERVAL)

        // Get final group of missing numbers to reenqueue.
        const numbersToReenqueue = this._sortInts(Array.from(this.numbersPendingReenqueue[chainId]))
        if (!numbersToReenqueue.length) {
            this._findGapsWithSeriesGeneration(chainId)
            return
        }

        // Create indexed block instances to enqueue for this missing numbers.
        const indexedBlocks = await this._upsertIndexedBlocks(numbersToReenqueue, chainId)
        if (!indexedBlocks.length) {
            logger.error(`[${chainId}] _upsertIndexedBlocks must have failed -- no entries to reenqueue.`)
            this._findGapsWithSeriesGeneration(chainId)
            return
        }

        logger.error(`[${chainId}:${new Date().toISOString()}] Enqueueing missing blocks found with series generation: ${numbersToReenqueue.join(', ')}`)
        await this._reenqueueBlocks(indexedBlocks)
        await sleep(1000)

        // Recurse.
        this._findGapsWithSeriesGeneration(chainId)
    }

    async _getLargestBlockNumberInSchema(schema: string): Promise<number | null> {
        try {
            const result = (await SharedTables.query(
                `select number from ${schema}.blocks order by number desc limit 1`
            ))[0] || {}
            return result.number ? Number(result.number) : null
        } catch (err) {
            logger.error(`Error finding largest number within ${schema}.blocks: ${err}`)
            return null
        }
    }

    async _findMissingBlockNumbersInSeries(schema: string, from: number, to: number): Promise<number[] | null> {
        try {
            const result = (await SharedTables.query(
                `select s.id as number from generate_series(${from}, ${to}) s(id) where not exists (select 1 from ${schema}.blocks WHERE number = s.id)`
            )) || []
            return result.map(r => Number(r.number))
        } catch (err) {
            logger.error(`Error finding missing numbers in ${schema}.blocks series (${from}, ${to}):${err}`)
            return null
        }
    }

    _sortInts(arr: number[]): number[] {
        return arr.sort((a, b) => a - b)
    }

    _chainChannel(chainId: string): string {
        return config.NEW_BLOCK_CHANNEL_PREFIX + chainId
    }
}

export default GapDetector