import { getBlockEventsSeriesNumber, getSkippedBlocks, deleteSkippedBlocks, addEagerBlock, setBlockEventsSeriesNumber, logger, markBlockAsSkipped, getEagerBlocks, deleteEagerBlocks } from '../../shared'
import config from './config'
import { generateEventsForBlock } from './queue'
import { sleep } from '../../shared'
import chalk from 'chalk'

async function perform({ blockNumber }) {
    blockNumber = Number(blockNumber)
    const [seriesNumber, skippedNumbers] = await Promise.all([
        getBlockEventsSeriesNumber(config.CHAIN_ID),
        getSkippedBlocks(config.CHAIN_ID)
    ])
    if (seriesNumber === null) throw 'Series number missing'

    // Replay from the skipped number to the current series 
    // number when a skipped number is finally received.
    if (skippedNumbers.includes(blockNumber)) {
        await replayFromBlock(blockNumber, seriesNumber)
        return
    }

    // Skip the current series number when it's too far behind.
    if (blockNumber - seriesNumber > config.MAX_LEADING_GAP_SIZE) {
        await skipBlock(seriesNumber, blockNumber)
        return
    }

    // Stash "eager" blocks in a holding area if they come in too early.
    if (blockNumber - seriesNumber > 0) {
        await addEagerBlockToHoldingZone(blockNumber)
        return
    }

    // Got target block in series.
    if (blockNumber === seriesNumber) {
        await gotTargetBlock(blockNumber)
    }
}

async function replayFromBlock(skippedBlockNumber: number, currentSeriesNumber: number) {
    logger.info(chalk.yellowBright(
        `Replaying blocks ${skippedBlockNumber.toLocaleString()} -> ${(currentSeriesNumber - 1).toLocaleString()}`
    ))

    // Remove reference to skipped block as "skipped". Do this first 
    // before processing the block and those ahead of it so that the 
    // event generator knows it can safely delete the cached block events.
    await deleteSkippedBlocks(config.CHAIN_ID, [skippedBlockNumber])

    let pastNumber = skippedBlockNumber
    while (pastNumber < currentSeriesNumber) {
        await generateEventsForBlock(pastNumber, 
            pastNumber === skippedBlockNumber ? { skipped: true } : { replay: true }
        )
        pastNumber++
    }
}

async function skipBlock(seriesNumber: number, latestBlockNumber: number) {
    logger.info(chalk.redBright(`Skipping block ${seriesNumber.toLocaleString()}`))

    const eagerNumbers = new Set(await getEagerBlocks(config.CHAIN_ID))
    const blocksToProcess = []
    const eagerBlocksToRemove = []

    // Walk forward, processing each block ahead of the one being skipped.
    let newSeriesNumber = seriesNumber + 1
    while (newSeriesNumber <= latestBlockNumber) {
        const isEager = eagerNumbers.has(newSeriesNumber)

        // Process the block if it's either waiting as an 
        // eager block or you make it to the end of the loop.
        if (isEager || newSeriesNumber === latestBlockNumber) {
            blocksToProcess.push(newSeriesNumber)
            isEager && eagerBlocksToRemove.push(newSeriesNumber)
            newSeriesNumber++
            continue

        }
        break // Dip out if you hit a new gap.
    }

    // If there's still a gap between the new series number and the 
    // latest one received, then handle the latest number as an eager block.
    if (newSeriesNumber < latestBlockNumber) {
        await addEagerBlockToHoldingZone(latestBlockNumber)
    }

    // Skip block first before processing blocks so they 
    // know not to delete their cached block events.
    await markBlockAsSkipped(config.CHAIN_ID, seriesNumber)
    await processBlocks(blocksToProcess)

    await Promise.all([
        deleteEagerBlocks(config.CHAIN_ID, eagerBlocksToRemove),
        setBlockEventsSeriesNumber(config.CHAIN_ID, newSeriesNumber),
    ])
}

async function addEagerBlockToHoldingZone(blockNumber: number) {
    logger.info(`Stashing eager block ${blockNumber.toLocaleString()}`)
    await addEagerBlock(config.CHAIN_ID, blockNumber)
}

async function gotTargetBlock(blockNumber: number) {
    // Add any eager blocks in the future series that are waiting on this block.
    const eagerNumbers = await getEagerBlocks(config.CHAIN_ID)
    const eagerBlocksToRemove = []
    let newSeriesNumber = blockNumber + 1
    for (const eagerNumber of eagerNumbers) {
        if (eagerNumber === newSeriesNumber) {
            eagerBlocksToRemove.push(eagerNumber)
            newSeriesNumber++
        } else {
            break
        }
    }

    await processBlocks([blockNumber, ...eagerBlocksToRemove])

    await Promise.all([
        deleteEagerBlocks(config.CHAIN_ID, eagerBlocksToRemove),
        setBlockEventsSeriesNumber(config.CHAIN_ID, newSeriesNumber),
    ])
}

async function processBlocks(numbers: number[]) {
    for (const number of numbers) {
        await generateEventsForBlock(number)
        numbers.length > 1 && await sleep(10)
    }
}

export default perform