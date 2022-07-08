import { BlockHeader } from 'web3-eth'
import { getlastSeenBlock, getBlockAtNumber, createIndexedBlock, uncleBlock, logger, range } from 'shared'
import { reportBlock } from '../queue'

async function handleNewBlocks(chainId: number, blockNumbers: number[], i: number, replace = false) {
    // Create new IndexedBlock record.
    const block = await createIndexedBlock({ chainId, blockNumber: blockNumbers[i] })

    // Enqueue block to be processed.
    await reportBlock(block, replace)

    if (i < blockNumbers.length - 1) {
        setTimeout(() => handleNewBlocks(chainId, blockNumbers, i + 1, replace))
    }
}

async function processNewHead(chainId: number, givenBlock: BlockHeader) {
    logger.info(`Received block: ${givenBlock.number}`)

    // Get the last seen block as well as the non-uncled block for the given number.
    let lastSeenBlock, blockAtGivenNumber
    try {
        ([lastSeenBlock, blockAtGivenNumber] = await Promise.all([
            getlastSeenBlock(chainId),
            getBlockAtNumber(chainId, givenBlock.number)
        ]));
    } catch (err) {
        logger.error('Error fetching existing IndexerDB state', err)
        return
    }

    const lastSeenBlockNumber = Number(lastSeenBlock?.blockNumber || (givenBlock.number - 1))
    let blockNumbersToEnqueue = [givenBlock.number]
    let replace = false
    try {
        // REORG.
        if (givenBlock.number <= lastSeenBlockNumber) {
            logger.warn(`REORG DETECTED - Marking block ${givenBlock.number} as uncled.`)
            blockAtGivenNumber && await uncleBlock(blockAtGivenNumber.id)
            replace = true
        }
        
        // TOO FAR AHEAD
        else if (givenBlock.number - lastSeenBlockNumber > 1) {
            blockNumbersToEnqueue = range(lastSeenBlockNumber + 1, givenBlock.number)
            logger.warn(`GAP IN BLOCKS - Playing catch up for blocks ${blockNumbersToEnqueue}.`)
        }

        await handleNewBlocks(chainId, blockNumbersToEnqueue, 0, replace)
    } catch (err) {
        logger.error(`Error processing new head at block number ${givenBlock.number}`, err)
    }
}

export default processNewHead