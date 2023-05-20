import config from './config'
import chalk from 'chalk'
import { generateEventsForBlock } from './queue'
import { 
    logger,
    sleep,
    canBlockBeOperatedOn, 
    getBlockEventsSeriesNumber,
    setBlockEventsSeriesNumber,
    addEagerBlock,
    getEagerBlocks,
    deleteEagerBlocks
} from '../../shared'

async function perform({ blockNumber }) {
    blockNumber = Number(blockNumber)

    // Ensure re-org hasn't occurred that would affect progress.
    if (!(await canBlockBeOperatedOn(config.CHAIN_ID, blockNumber))) {
        logger.notify(chalk.yellow(`[${blockNumber}] Reorg was detected. Stopping.`))
        return
    }
    
    // Get the current series number for this chain.
    let seriesNumber = await getBlockEventsSeriesNumber(config.CHAIN_ID)
    if (seriesNumber === null) {
        seriesNumber = blockNumber
    }

    // Stash "eager" blocks in a holding area if they come in too early.
    if (blockNumber - seriesNumber > 0) {
        const gap = blockNumber - seriesNumber
        const shouldLog = (gap >= config.WARN_AT_GAP_SIZE) && (gap % 10 === 0)
        shouldLog && logger.error(`[${config.CHAIN_ID}] Gap size significant: ${blockNumber} vs. ${seriesNumber}`)
        await addEagerBlockToHoldingZone(blockNumber)
        return
    }

    // Got target block in series.
    if (blockNumber === seriesNumber) {
        await gotTargetBlock(blockNumber)
        return
    }

    // Blocks less than the current series number get pushed through only in force situations.
    logger.notify(`Got number less than series number: ${blockNumber} vs. ${seriesNumber}`)
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