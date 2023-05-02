import {
    getHighestBlock,
    createIndexedBlock,
    getBlocksInNumberRange,
    logger,
    sleep,
    uncleBlocks,
    range,
    StringKeyMap,
    toChunks,
    avgBlockTimesForChainId,
    freezeBlockOperationsAbove,
    IndexedBlock,
} from '../../../shared'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import config from '../config'
import { BlockHeader } from 'web3-eth'
import { reportBlock } from '../queue'
import { NewBlockSpec } from '../types'
import rollbackTables from '../services/rollbackTables'
import chalk from 'chalk'

class EvmReporter {

    chainId: string

    web3: AlchemyWeb3

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

    constructor(chainId: string) {
        this.chainId = chainId
        this.web3 = createAlchemyWeb3(config.ALCHEMY_SUBSCRIPTION_URL)
        this.unclePauseTime = Math.min(
            avgBlockTimesForChainId[this.chainId] * 1000 * config.UNCLE_PAUSE_TIME_IN_BLOCKS,
            config.UNCLE_PAUSE_TIME,
        )
    }

    async listen() {
        logger.info(`Listening for new heads on chain ${this.chainId}...`)
        this.web3.eth
            .subscribe('newBlockHeaders')
            .on('data', (data) => this._onNewBlockHeader(data))
            .on('error', (e) => logger.error('Alchemy subscription error', e))
    }

    _onNewBlockHeader(data: BlockHeader) {
        const blockNumber = Number(data.number)
        logger.info(chalk.gray(`\n> Got ${blockNumber}`))

        if (this.ignoreOnceDueToReorg.has(blockNumber)) {
            this.ignoreOnceDueToReorg.delete(blockNumber)

            if (this.currentReorgCeiling && blockNumber > this.currentReorgCeiling) {
                this.buffer[blockNumber.toString()] = data
            } else {
                logger.info(chalk.magenta(`> Ignoring ${blockNumber} once`))
            }
            return
        }

        const isReplayOfBlock = blockNumber === this.highestSeen
        this.highestSeen = Math.max(this.highestSeen, blockNumber)

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
        this.processing = true
        
        const head = this._pluckSmallestBlockFromBuffer()
        if (!head) {
            this.processing = false
            return
        }

        await this._processNewHead(head)
        
        if (Object.keys(this.buffer).length) {
            await this._processBuffer()
        } else {
            this.processing = false
        }
    }

    async _processNewHead(givenBlock: BlockHeader) {
        logger.info(`> Processing ${givenBlock.number}`)
        
        if (givenBlock.number === this.waitAfterUncleAt) {
            this.waitAfterUncleAt = null
            logger.info(`Waiting extra at ${givenBlock.number} due to re-org previously seen in buffer.`)
            await sleep(this.unclePauseTime / 2)
        }

        const highestBlock = await this._getHighestIndexedBlock()
        const highestBlockNumber = highestBlock?.number || givenBlock.number - 1
    
        let newBlockSpecs: NewBlockSpec[] = [{ 
            hash: givenBlock.hash, 
            number: givenBlock.number,
        }]
        
        try {
            // [REORG] If given block number is less than the 
            // highest one seen, treat it as a re-org.
            if (givenBlock.number <= highestBlockNumber) {
                this.currentReorgFloor = givenBlock.number
                this.currentReorgCeiling = highestBlockNumber
                logger.warn(chalk.red(`REORG DETECTED - Marking blocks ${givenBlock.number} -> ${highestBlockNumber} as uncled.`))

                if (highestBlockNumber - givenBlock.number > config.MAX_REORG_SIZE) {
                    throw `Unbelievable Reorg detected ${highestBlockNumber} -> ${givenBlock.number}`
                }

                await this._uncleBlocks(givenBlock, highestBlockNumber, this.unclePauseTime)
                this.currentReorgFloor = null
                this.currentReorgCeiling = null
                this.replacementReorgFloorBlock = null
                this.isHandlingReorgBlocks = false
                return
            }
    
            // [GAP] If the given block number is greater than the 
            // highest one seen by MORE THAN 1, fill in the gaps.
            if (givenBlock.number - highestBlockNumber > 1) {
                const numberToHash = await this._getBlockHashesForNumbers(
                    range(highestBlockNumber + 1, givenBlock.number),
                    {},
                )

                newBlockSpecs = []
                for (let i = highestBlockNumber + 1; i < givenBlock.number + 1; i++) {
                    if (i === givenBlock.number) {
                        newBlockSpecs.push({ hash: givenBlock.hash, number: givenBlock.number })
                    } else {
                        newBlockSpecs.push({ hash: numberToHash[i.toString()] || null, number: i })
                    }
                }

                logger.warn(chalk.yellow(
                    `GAP IN BLOCKS - Playing catch up for blocks ${
                        newBlockSpecs[0].number
                    } -> ${newBlockSpecs[newBlockSpecs.length - 1].number}`
                ))
            }
    
            await this._handleNewBlocks(newBlockSpecs.sort((a, b) => a.number - b.number))
        } catch (err) {
            logger.error(`Error processing new head at block number ${givenBlock.number}`, err)
        }    
    }

    async _uncleBlocks(fromBlock: BlockHeader, to: number, pauseTime: number) {
        const fromNumber = Number(fromBlock.number)
        const uncleRange = range(fromNumber, to)

        // Freeze all operations downstream in the data pipeline using
        // any numbers greater than or equal to the smallest uncle block.
        await freezeBlockOperationsAbove(this.chainId, fromNumber)
    
        // Get all blocks in the range that are not uncled yet.
        const blocksInRangeNotUncledYet = (
            await getBlocksInNumberRange(this.chainId, uncleRange)
        ).filter(b => !b.uncled)

        // Stop and redo uncle process from an even lower block if seen.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
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
        await sleep(pauseTime)

        // Check again.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
                await this._uncleBlocks(floorReplacement, to, this.unclePauseTime / 2)
                return    
            }
        }
        
        // Perform all record rollbacks.
        logger.info(`> Rolling back to ${fromBlock.number}`)
        await rollbackTables(this.chainId, fromBlock)
        logger.info(chalk.green(`Rollback to ${fromBlock.number} complete.`))

        // Refetch hashes for block numbers.
        const currentHashes = await this._getBlockHashesForNumbers(uncleRange, {})

        // Find the indexed blocks whose hashes are different from "current".
        const indexedBlocksToUncle =[]
        for (const number of uncleRange) {
            const indexedBlocksWithNumber = mappedBlocksNotUncledYet[number.toString()]
            if (!indexedBlocksWithNumber?.length) continue

            const currentHash = currentHashes[number.toString()]
            for (const indexedBlock of indexedBlocksWithNumber) {
                if (indexedBlock.hash !== currentHash) {
                    indexedBlocksToUncle.push(indexedBlock)
                }
            }
        }

        // Mark blocks as uncled in both IndexerDB and redis.
        indexedBlocksToUncle.length && await uncleBlocks(indexedBlocksToUncle)

        // One last check before handling blocks.
        if (this.replacementReorgFloorBlock) {
            const floorReplacement = this._prepEvenLowerReorgBlock(to)
            if (floorReplacement) {
                this.replacementReorgFloorBlock = null
                await this._uncleBlocks(floorReplacement, to, this.unclePauseTime / 2)
                return    
            }
        }

        this.isHandlingReorgBlocks = true

        // TODO: Broadcast reorg event out to all spec clients.

        const blockSpecs = []
        for (const number in currentHashes) {
            const hash = currentHashes[number]
            blockSpecs.push({ hash, number: Number(number) })
        }
        
        await this._handleNewBlocks(
            blockSpecs.sort((a, b) => a.number - b.number), 
            0,
            true, // replace
        )
    }

    async _handleNewBlocks(
        blockSpecs: NewBlockSpec[],
        i: number = 0,
        replace = false
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
            await freezeBlockOperationsAbove(this.chainId, nextNumber)
        }

        // Enqueue block to be processed.
        await reportBlock(block, replace)

        // Recurse.
        if (i < blockSpecs.length - 1) {
            await sleep(10)
            await this._handleNewBlocks(blockSpecs, i + 1, replace)
        }
    }

    async _getBlockHashesForNumbers(numbers: number[], numberToHash: any = {}) {
        logger.info(chalk.gray(`> Getting latest block hashes for numbers ${numbers[0]} -> ${numbers[numbers.length - 1]}`))
        const chunks = toChunks(numbers, 10)
        const hashes = []
        for (const chunk of chunks) {
            const chunkHashes = await Promise.all(chunk.map(num => this._getBlockHashForNumber(num)))
            hashes.push(...chunkHashes)
        }
        const refetchNumbers = []
        for (let i = 0; i < numbers.length; i++) {
            const number = numbers[i]
            const hash = hashes[i]
            if (hash) {
                numberToHash[number.toString()] = hash
            } else {
                refetchNumbers.push(number)
            }
        }
        if (refetchNumbers.length) {
            logger.warn(
                `Hashes missing for numbers ${refetchNumbers.join(', ')}. Waiting and retrying...`
            )
            await sleep(3000)
            return this._getBlockHashesForNumbers(refetchNumbers, numberToHash)
        }
        return numberToHash
    }

    async _getBlockHashForNumber(blockNumber: number): Promise<string> {
        let externalBlock = null
        let numAttempts = 0
        try {
            while (externalBlock === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
                externalBlock = await this._fetchBlock(blockNumber)
                if (externalBlock === null) {
                    await sleep(
                        (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                    )
                }
                numAttempts += 1
            }
        } catch (err) {
            logger.error(`Error fetching block ${blockNumber}: ${err}`)
            return null
        }
        if (externalBlock === null) {
            logger.error(`Out of attempts - No block found for ${blockNumber}...`)
            return null
        }
        return externalBlock.hash
    }

    async _fetchBlock(blockNumber: number): Promise<StringKeyMap | null> {
        let error, block
        try {
            block = await this.web3.eth.getBlock(blockNumber, false)
        } catch (err) {
            error = err
        }
        if (error) {
            logger.error(`Error fetching block ${blockNumber}: ${error}. Will retry.`)
            return null
        }
        return block
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
        logger.warn(chalk.red(`DEEPER REORG DETECTED - Switching to uncle range ${lowerNumber} -> ${to}`))
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
}

export default EvmReporter