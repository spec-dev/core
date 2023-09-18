import {
    getHighestBlock,
    createIndexedBlock,
    getBlocksInNumberRange,
    logger,
    sleep,
    uncleBlocks,
    range,
    avgBlockTimesForChainId,
    freezeBlockOperationsAtOrAbove,
    IndexedBlock,
    deleteBlockCalls,
    deleteBlockEvents,
    getBlockOpsCeiling,
    setProcessNewHeads,
    shouldProcessNewHeads,
    publishReorg,
    createReorg, 
    updateReorg,
    ReorgStatus,
    newEvmWeb3ForChainId, 
    EvmWeb3,
    newIndexerRedisClient,
    indexerRedisKeys,
    schemaForChainId,
    SharedTables,
    identPath,
    StringKeyMap,
    numSecondsBetween,
} from '../../../shared'
import config from '../config'
import { BlockHeader } from 'web3-eth'
import { reportBlock } from '../queue'
import { NewBlockSpec } from '../types'
import { rollbackTables } from '../services/rollbackTables'
import chalk from 'chalk'
import LRU from 'lru-cache'

class EvmReporter {

    chainId: string

    web3: EvmWeb3

    connectionIndex: number = 0

    endpoints: string[]

    buffer: { [key: string]: BlockHeader } = {}

    processing: boolean = false

    unclePauseTime: number

    highestSeen: number = 0

    currentReorgFloor: number | null = null

    currentReorgCeiling: number | null = null

    replacementReorgFloorBlock: BlockHeader | null = null

    isHandlingReorgBlocks: boolean = false
    
    waitAfterUncleAt: number | null = null

    ignoreOnceDueToReorg: Set<number> = new Set()

    isFailing: boolean = false

    subRedis: any

    lastHeadSeenAt: Date | null = null

    mostRecentBlockHashes: LRU<string, string> = new LRU({
        max: config.MAX_REORG_SIZE * 5,
    })

    startedDeepReorgDetection: boolean = false

    constructor() {
        this.chainId = config.CHAIN_ID
        this.subRedis = newIndexerRedisClient(config.INDEXER_REDIS_URL)
        this.unclePauseTime = Math.min(
            avgBlockTimesForChainId[this.chainId] * 1000 * config.UNCLE_PAUSE_TIME_IN_BLOCKS,
            config.UNCLE_PAUSE_TIME,
        )
        this.endpoints = config.WS_PROVIDER_POOL
            .replace(/\|/g, ',').split(',').map(url => url.trim()).filter(url => !!url)
    }

    async listen() {
        if (!(await shouldProcessNewHeads(this.chainId))) {
            logger.notify(chalk.yellow(`Won't process new heads -- master switch is off.`))
            return
        }

        await this.subRedis.connect()

        this._createWeb3Provider()
        this._subscribeToNewHeads()
        this._subscribeToForcedRollbacks()

        // Start interval check for dropped connection.
        setInterval(
            async () => await this._checkForDroppedConnection(), 
            config.DROPPED_CONNECTION_CHECK_INTERVAL,
        )
    }

    _subscribeToNewHeads() {
        this.web3.subscribeToNewHeads((error, data) => {
            this.lastHeadSeenAt = new Date()
            if (error) {
                console.log(error)
                logger.error(chalk.red(`RPC subscription error: ${error}`))
                this._rotateWeb3Providers()
                return
            }
            this._onNewBlockHeader(data as BlockHeader)
        })
        logger.info(chalk.greenBright(`Listening for new heads on chain ${this.chainId}...`))
    }

    _onNewBlockHeader(data: BlockHeader) {
        if (this.isFailing) return

        const blockNumber = Number(data.number)
        this.mostRecentBlockHashes.set(blockNumber.toString(), data.hash)

        console.log('')
        logger.info(chalk.gray(`Got ${blockNumber}`))

        if (this.ignoreOnceDueToReorg.has(blockNumber)) {
            this.ignoreOnceDueToReorg.delete(blockNumber)

            if (this.currentReorgCeiling && blockNumber > this.currentReorgCeiling) {
                this.buffer[blockNumber.toString()] = data
            } else {
                logger.info(chalk.magenta(`Ignoring ${blockNumber} once`))
            }
            return
        }

        const isReplayOfBlock = blockNumber === this.highestSeen
        this.highestSeen = Math.max(this.highestSeen, blockNumber)
        
        if (!this.startedDeepReorgDetection) {
            this.startedDeepReorgDetection = true
            setInterval(
                () => this._detectDeepReorgs(), 
                this.web3?.finalityScanInterval || config.FINALITY_SCAN_INTERVAL,
            )
        }

        // If another reorg occurs within the buffer while still working
        // on an active uncle, add extra wait time when the active uncle completes.
        const reOrgIsActivelyOccuring = this.currentReorgCeiling !== null
        if (reOrgIsActivelyOccuring && (blockNumber < this.highestSeen || isReplayOfBlock)) {
            this.waitAfterUncleAt = !!this.waitAfterUncleAt
                ? Math.min(blockNumber, this.waitAfterUncleAt)
                : blockNumber

            // If the block number that just came in is even LOWER than the current floor
            // block that's being uncled, and the current uncle isn't complete yet, replace the
            // floor with this even lower number and restart the uncle process.
            if (blockNumber < this.currentReorgFloor && !this.isHandlingReorgBlocks) {
                this.replacementReorgFloorBlock = data
            }
        }

        if (blockNumber < this.highestSeen) {
            range(blockNumber + 1, this.highestSeen).forEach(number => {
                this.ignoreOnceDueToReorg.add(number)
            })
        }

        this.buffer[blockNumber.toString()] = data
        this.processing || this._processBuffer()
    }

    async _processBuffer() {
        if (this.isFailing) return
        this.processing = true
        
        const head = this._pluckSmallestBlockFromBuffer()
        if (!head) {
            this.processing = false
            return
        }

        try {
            await this._processNewHead(head)
        } catch (err) {
            logger.error(chalk.redBright(`Processing head failed at ${head.number}`), err)
            await this._stop(head.number)
            return
        }
        
        if (Object.keys(this.buffer).length) {
            await this._processBuffer()
        } else {
            this.processing = false
        }
    }

    async _processNewHead(givenBlock: BlockHeader) {
        logger.info(`Processing ${givenBlock.number}...`)
        
        if (givenBlock.number === this.waitAfterUncleAt) {
            this.waitAfterUncleAt = null
            logger.warn(`Waiting extra at ${givenBlock.number} due to re-org previously seen in buffer.`)
            await sleep(this.unclePauseTime / 2)
        }

        const highestBlock = await this._getHighestIndexedBlock()
        const highestBlockNumber = highestBlock?.number || givenBlock.number - 1
    
        let newBlockSpecs: NewBlockSpec[] = [{ 
            hash: givenBlock.hash, 
            number: givenBlock.number,
        }]
    
        // [REORG] If given block number is less than the highest one seen, treat it as a re-org.
        if (givenBlock.number <= highestBlockNumber) {
            this.currentReorgFloor = givenBlock.number
            this.currentReorgCeiling = highestBlockNumber
            logger.info(chalk.red(`REORG DETECTED - Marking blocks ${givenBlock.number} -> ${highestBlockNumber} as uncled.`))

            if (highestBlockNumber - givenBlock.number > config.MAX_REORG_SIZE) {
                // TODO: Bring back throwing when back online.
                logger.error(`Unbelievable Reorg detected ${highestBlockNumber} -> ${givenBlock.number}`)
                return
            }

            await this._uncleBlocks(
                givenBlock, 
                highestBlockNumber, 
                this.unclePauseTime,
            )

            this.currentReorgFloor = null
            this.currentReorgCeiling = null
            this.replacementReorgFloorBlock = null
            this.isHandlingReorgBlocks = false
            return
        }

        // [GAP] If the given block number is greater than the 
        // highest one seen by MORE THAN 1, fill in the gaps.
        if (givenBlock.number - highestBlockNumber > 1) {
            newBlockSpecs = []
            for (let i = highestBlockNumber + 1; i < givenBlock.number + 1; i++) {
                if (i === givenBlock.number) {
                    newBlockSpecs.push({ hash: givenBlock.hash, number: givenBlock.number })
                } else {
                    newBlockSpecs.push({ hash: null, number: i })
                }
            }

            logger.notify(chalk.yellow(
                `GAP IN BLOCKS - Playing catch up for blocks ${
                    newBlockSpecs[0].number
                } -> ${newBlockSpecs[newBlockSpecs.length - 1].number}`
            ))
        }

        await this._handleNewBlocks(newBlockSpecs.sort((a, b) => a.number - b.number))
    }

    async _uncleBlocks(fromBlock: BlockHeader, to: number, pauseTime: number) {
        const fromNumber = Number(fromBlock.number)
        const uncleRange: number[] = range(fromNumber, to)

        // Persist reorg to IndexerDB for telemetry.
        const reorg = await createReorg(this.chainId, fromNumber, to)

        // If a block can't be uncled, it's because there's an even LOWER
        // block number that failed indexing and the entire chain has been stopped.
        const currentBlockCeiling = await getBlockOpsCeiling(this.chainId)
        if (currentBlockCeiling && currentBlockCeiling < fromNumber) {
            const error = (
                `Uncle on range ${fromNumber} -> ${to} stopped. Chain ${this.chainId} currently` + 
                `has a ceiling of ${currentBlockCeiling}, which is less than the uncle floor.`
            )
            logger.error(error)
            updateReorg(reorg.id, { failed: true, error })
            this._stop(fromNumber)
            return
        }

        // Freeze all operations downstream in the data pipeline using
        // any numbers greater than or equal to the smallest uncle block.
        // Also delete any cached block events/calls from redis that 
        // would have been piped downstream.
        await Promise.all([
            freezeBlockOperationsAtOrAbove(this.chainId, fromNumber),
            deleteBlockEvents(this.chainId, uncleRange),
            deleteBlockCalls(this.chainId, uncleRange),
        ])
            
        // Get all blocks in the range that are not uncled yet.
        const blocksInRangeNotUncledYet = (
            await getBlocksInNumberRange(this.chainId, uncleRange)
        ).filter(b => !b.uncled)

        // Stop and redo uncle process from an even lower block if seen.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
                updateReorg(reorg.id, { status: ReorgStatus.Replaced })
                await this._uncleBlocks(floorReplacement, to, this.unclePauseTime / 2)
                return    
            }
        }

        // Map the above by block number.
        const mappedBlocksNotUncledYet = {}
        for (const indexedBlock of blocksInRangeNotUncledYet) {
            const key = indexedBlock.number.toString()
            mappedBlocksNotUncledYet[key] = mappedBlocksNotUncledYet[key] || []
            mappedBlocksNotUncledYet[key].push(indexedBlock)
        }

        // Wait for RPC provider to get their shit together and 
        // for the rest of our downstream data pipeline to clear out.
        updateReorg(reorg.id, { status: ReorgStatus.Waiting })
        await sleep(pauseTime)

        // Check again.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
                updateReorg(reorg.id, { status: ReorgStatus.Replaced })
                await this._uncleBlocks(floorReplacement, to, this.unclePauseTime / 2)
                return    
            }
        }
        
        // Perform all record rollbacks.
        logger.info(`Rolling back to ${fromNumber}`)
        updateReorg(reorg.id, { status: ReorgStatus.RollingBack })
        try {
            await rollbackTables(this.chainId, fromBlock, to)
        } catch (err) {
            const msg = err.message || err.toString() || ''
            const error = `[${fromNumber}] ${chalk.redBright('Rollback failed')}: ${msg}`
            logger.error(error)
            updateReorg(reorg.id, { failed: true, error })
            await this._stop(fromNumber)
            return
        }
        logger.info(chalk.green(`Rollback to ${fromNumber} complete.`))

        // Find the indexed blocks whose hashes are different from "current".
        const indexedBlocksToUncle = []
        for (const number of uncleRange) {
            const indexedBlocksWithNumber = mappedBlocksNotUncledYet[number.toString()]
            if (!indexedBlocksWithNumber?.length) continue

            const currentHash = this.mostRecentBlockHashes.get(number.toString())
            if (!currentHash) continue

            for (const indexedBlock of indexedBlocksWithNumber) {
                if (indexedBlock.hash !== currentHash) {
                    indexedBlocksToUncle.push(indexedBlock)
                }
            }
        }

        // Mark blocks as uncled in both IndexerDB and redis.
        let stats = {}
        if (indexedBlocksToUncle) {
            stats = {
                uncled: indexedBlocksToUncle.map(({ number, hash }) => ({ number, hash })),
            }
            await uncleBlocks(indexedBlocksToUncle)
        }

        // One last check before handling blocks.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
                updateReorg(reorg.id, { status: ReorgStatus.Replaced })
                await this._uncleBlocks(floorReplacement, to, this.unclePauseTime / 2)
                return
            }
        }

        this.isHandlingReorgBlocks = true

        // Broadcast reorg event to all spec clients.
        updateReorg(reorg.id, { status: ReorgStatus.Publishing, stats })
        logger.info(chalk.green(`Publishing reorg for ${this.chainId}:${fromNumber} (${reorg.uid})...`))
        await publishReorg(reorg.uid, this.chainId, fromNumber)
        await sleep(3000)

        const blockSpecs = []
        for (const number of uncleRange) {
            blockSpecs.push({ 
                hash: this.mostRecentBlockHashes.get(number.toString()) || null, 
                number: Number(number),
            })
        }
        
        await this._handleNewBlocks(
            blockSpecs.sort((a, b) => a.number - b.number), 
            0,
            true, // replace
        )

        logger.info(chalk.green(`Reorg successful for ${this.chainId}:${fromNumber}.`))
        updateReorg(reorg.id, { status: ReorgStatus.Complete })
    }

    async _handleNewBlocks(
        blockSpecs: NewBlockSpec[],
        i: number = 0,
        replace = false,
        delayInBetween: number = 75,
    ) {
        const { number, hash } = blockSpecs[i]
    
        // Create new IndexedBlock record.
        const block = await createIndexedBlock({ 
            chainId: Number(this.chainId), 
            number, 
            hash,
        })

        // Raise freeze block threshold by 1 and let this reorg block through.
        if (replace) {
            const nextNumber = blockSpecs[i + 1]?.number || null
            await freezeBlockOperationsAtOrAbove(this.chainId, nextNumber)
        }

        // Enqueue block to be processed.
        await reportBlock(block, replace)

        // Recurse.
        if (i < blockSpecs.length - 1) {
            await sleep(delayInBetween)
            await this._handleNewBlocks(blockSpecs, i + 1, replace, delayInBetween)
        }
    }

    async _getHighestIndexedBlock(): Promise<IndexedBlock | null> {
        try {
            return await getHighestBlock(this.chainId)
        } catch (err) {
            logger.error('Error fetching highest block number from IndexerDB', err)
            return null
        }
    }

    _prepEvenLowerReorgBlock(to: number): BlockHeader | null {
        const replacment = this.replacementReorgFloorBlock
        if (!replacment) return null
        const lowerNumber = replacment.number
        const lowerNumberStr = lowerNumber.toString()
        this.currentReorgFloor = lowerNumber
        if (this.buffer.hasOwnProperty(lowerNumberStr)) {
            delete this.buffer[lowerNumberStr]
        }
        logger.info(chalk.red(`DEEPER REORG DETECTED - Switching to uncle range ${lowerNumber} -> ${to}`))
        return replacment
    }

    _pluckSmallestBlockFromBuffer(): BlockHeader | null {
        const numbers = Object.keys(this.buffer).map(n => Number(n)).sort((a, b) => a - b)
        if (!numbers.length) return null
        const smallest = numbers[0].toString()
        const head = this.buffer[smallest]
        delete this.buffer[smallest]
        return head
    }

    async _stop(blockNumber: number) {
        logger.error(chalk.redBright(`Stopping head reporter at ${blockNumber}.`))
        this.isFailing = true
        await setProcessNewHeads(this.chainId, false)
    }

    _subscribeToForcedRollbacks() {
        const key = [indexerRedisKeys.FORCED_ROLLBACK, this.chainId].join('-')
        this.subRedis.subscribe(key, async message => {
            let payload
            try {
                payload = JSON.parse(message)
            } catch (err) {
                logger.error(
                    `Error parsing pubsub message from ${key} — ${message}: ${err}`
                )
                return
            }

            let { blockNumber, blockHash, unixTimestamp } = payload
            blockHash = this.mostRecentBlockHashes.get(blockNumber.toString()) || blockHash || null
            if (!blockHash) {
                try {
                    const { block, unixTimestamp: fetchedTs } = await this.web3.getBlock(
                        null, 
                        blockNumber, 
                        this.chainId, 
                        false,
                    )
                    blockHash = block.hash
                    unixTimestamp = fetchedTs
                } catch (err) {
                    logger.error(`Forced rollback error — couldn't fetch block by number ${blockNumber}: ${err}`)
                    return
                }
            }

            logger.info(chalk.magenta(`Received forced rollback request — ${blockNumber} (${blockHash})`))

            const mockHeader = {
                number: blockNumber,
                hash: blockHash,
                timestamp: unixTimestamp,
            }
            this._onNewBlockHeader(mockHeader as BlockHeader)
        })
    }

    async _detectDeepReorgs() {
        if (!this.web3) return

        // Get the block range to scan (leading up to the head).
        let fromBlockNumber = await this._getLatestFinalizedBlockNumber()
        if (fromBlockNumber === null) return
        fromBlockNumber -= config.FINALITY_SCAN_OFFSET_LEFT
        const offsetRight = this.web3.finalityScanOffsetRight || config.FINALITY_SCAN_OFFSET_RIGHT
        const toBlockNumber = Math.max(this.highestSeen - offsetRight, 0)
        
        // Get the currently saved blocks >= the floor number.
        const savedBlocks = await this._getSavedBlocksInRange(fromBlockNumber, toBlockNumber)
        if (!Object.keys(savedBlocks).length) {
            logger.notify(`[${this.chainId}] No blocks between ${fromBlockNumber} -> ${toBlockNumber}`)
            return
        }

        // Sort the block numbers least-to-greatest.
        const blockNumbers = Object.keys(savedBlocks).map(n => Number(n)).sort((a, b) => a - b)
        const largestNumber = blockNumbers[blockNumbers.length - 1]

        logger.info(chalk.magenta(
            `Checking for deep reorgs across ${blockNumbers.length} blocks:` + 
            ` ${blockNumbers[0]} -> ${largestNumber} (head=${this.highestSeen}, offset=${this.highestSeen - largestNumber})`
        ))

        // Iterate over the block range, finding the smallest block number with a hash mismatch.
        const t0 = performance.now()
        const mismatches: StringKeyMap = []
        for (const blockNumber of blockNumbers) {
            const { hash: currentHash, timestamp } = savedBlocks[blockNumber.toString()]
            let actualHash
            try {
                if (!this.web3) return
                actualHash = await this.web3.blockHashForNumber(blockNumber)
            } catch (err) {
                logger.error(`Finality scan error: ${err}`)
                return
            }
            if (currentHash !== actualHash) {
                mismatches.push({ blockNumber, largestNumber, currentHash, actualHash,timestamp })
            }
        }
        
        if (mismatches.length) {
            const earliestMismatch = mismatches[0]
            const otherMismatches = mismatches.slice(1)
            await this._handleDeepHashMismatch(earliestMismatch, otherMismatches)
            return
        }

        const tf = performance.now()
        const elapsed = Number(((tf - t0) / 1000).toFixed(2))
        logger.info(chalk.magenta(`No deep reorgs found (${elapsed}s)`)) 
    }

    async _getLatestFinalizedBlockNumber() {
        // If the finalized tag isn't supported by this chain, 
        // use the latest block number saved minus the number 
        // of blocks it takes for finality confirmation.
        if (!this.web3.supportsFinalizedTag) {
            const confirmationDepth = this.web3.confirmationsUntilFinalized
            if (!confirmationDepth) {
                logger.error(
                    `[${this.chainId}] Can't scan for finality — "confirmationsUntilFinalized" not set.`
                )
                return null
            }

            const latestBlockNumber = await this._getLatestBlockNumberIndexed()
            if (latestBlockNumber === null) {
                logger.error(
                    ` ${this.chainId} Can't scan for finality — no blocks found in shared tables.`
                )
                return null
            }

            return Math.max(latestBlockNumber - confirmationDepth, 0)
        }

        // Get latest block number tagged as finalized.
        try {
            if (!this.web3) return null
            return await this.web3.latestFinalizedBlockNumber()
        } catch (err) {
            logger.error(`[${this.chainId}] Error getting latest finalized block: ${err}`)
            return null
        }
    }

    async _getSavedBlocksInRange(fromNumber: number, toNumber: number): Promise<StringKeyMap> {
        const schema = schemaForChainId[this.chainId]
        const tablePath = [schema, 'blocks'].join('.')

        let rows = []
        try {
            rows = await SharedTables.query(
                `select number, hash, timestamp from ${identPath(tablePath)} where number >= $1 and number <= $2 order by number asc`,
                [fromNumber, toNumber]
            )    
        } catch (err) {
            logger.error(err)
            return {}
        }

        const data = {}
        for (const { number, hash, timestamp } of rows) {
            data[number.toString()] = { hash, timestamp }
        }
        return data
    }

    async _getLatestBlockNumberIndexed(): Promise<number | null> {
        const schema = schemaForChainId[this.chainId]
        const tablePath = [schema, 'blocks'].join('.')
        try {
            const result = (await SharedTables.query(
                `select number from ${identPath(tablePath)} order by number desc limit 1`
            ))[0] || {}
            return result.number ? Number(result.number) : null
        } catch (err) {
            logger.error(`Error finding largest block number in SharedTables for ${tablePath}: ${err}`)
            return null
        }
    }

    async _handleDeepHashMismatch(earliestMismatch: StringKeyMap, otherMismatches: StringKeyMap[]) {
        const { blockNumber, largestNumber, currentHash, actualHash, timestamp } = earliestMismatch

        // Don't do anything if there's a smaller number in the buffer.
        const smallestInBuffer = Object.keys(this.buffer).map(n => Number(n)).sort((a, b) => a - b)[0]
        if (smallestInBuffer <= blockNumber) {
            logger.notify(
                `[${this.chainId}] Deep Reorg Detection — Got mismatch for ${blockNumber} but ${smallestInBuffer} is still in buffer...`,
                blockNumber,
                currentHash,
                actualHash,
            )
            return
        }

        // Ensure we're only ever going further back.
        if (this.currentReorgFloor && blockNumber >= this.currentReorgFloor) return
        try {
            const currentBlockCeiling = await getBlockOpsCeiling(this.chainId)
            if (currentBlockCeiling && currentBlockCeiling < blockNumber) return    
        } catch (err) {
            logger.error(err)
            return
        }

        const savedDepth = largestNumber - blockNumber
        const actualDepth = this.highestSeen - blockNumber

        // Kick off re-org.
        const msg = (
            `[${this.chainId}] DEEP REORG DETECTED at ${blockNumber} ` + 
            `(savedHead=${largestNumber}, seenHead=${this.highestSeen}, depths=${savedDepth}:${actualDepth}, ` + 
            `current=${currentHash}, actual=${actualHash}, provider=${this.web3?.url})`
        )
        logger.warn(chalk.redBright(msg))
        if (actualDepth > config.MAX_DEPTH_BEFORE_REORG_NOTIFICATION) {
            logger.notify(msg)
        }

        // Update the other hashes that were found to be different in our cache.
        otherMismatches.forEach(mismatch => {
            this.mostRecentBlockHashes.set(mismatch.blockNumber.toString(), mismatch.actualHash)
        })

        const mockHeader = {
            number: blockNumber,
            hash: actualHash,
            timestamp: Math.floor(new Date(timestamp).valueOf() / 1000)
        }
        this._onNewBlockHeader(mockHeader as BlockHeader)
    }

    _createWeb3Provider() {
        this.web3 = newEvmWeb3ForChainId(
            this.chainId, 
            this.endpoints[this.connectionIndex] || this.endpoints[0],
            true,
        )
    }

    async _rotateWeb3Providers() {
        await sleep(10)
        const provider = this.web3?.web3?.currentProvider as any
        provider?.removeAllListeners && provider.removeAllListeners()
        provider?.disconnect && provider.disconnect()
        this.web3 = null
        await sleep(10)

        if (this.connectionIndex < this.endpoints.length - 1) {
            this.connectionIndex++
        } else {
            this.connectionIndex = 0
        }

        logger.notify(
            `[${this.chainId}] Rotating HR Providers — New Index: ${this.connectionIndex}/${this.endpoints.length}`
        )
        
        this._createWeb3Provider()
        this._subscribeToNewHeads()
    }

    async _checkForDroppedConnection() {
        if (!this.lastHeadSeenAt) return

        const minSinceLastHead = numSecondsBetween(new Date(), this.lastHeadSeenAt)
        if (minSinceLastHead <= config.MAX_TIME_GAP_UNTIL_AUTO_RECONNECT) return
        logger.warn(`Max time gap between heads reached -- attempting auto-reconnect...`)
        this.lastHeadSeenAt = null
        
        const provider = this.web3?.web3?.currentProvider as any
        provider?.removeAllListeners && provider.removeAllListeners()
        provider?.disconnect && provider.disconnect()
        this.web3 = null

        await sleep(10)
        this._createWeb3Provider()
        this._subscribeToNewHeads()
    }
}

export default EvmReporter