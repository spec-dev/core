import { BlockHeader } from 'web3-eth'
import { getlastSeenBlock, getBlockAtNumber, createIndexedBlock, uncleBlock, logger, range } from 'shared'

async function handleNewBlocks(chainId: number, blockNumbers: number[], i: number = 0) {
    // Create new IndexedBlock record.
    const block = await createIndexedBlock({ chainId, blockNumber: blockNumbers[i] })

    // Enqueue block to be processed.
    logger.info(`Adding block ${blockNumbers[i]} for processing...`)

    if (i < blockNumbers.length - 1) {
        setTimeout(() => handleNewBlocks(chainId, blockNumbers, i + 1))
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

    try {
        // REORG.
        if (givenBlock.number <= lastSeenBlockNumber) {
            logger.warn(`REORG DETECTED - Marking block ${givenBlock.number} as uncled.`)
            blockAtGivenNumber && uncleBlock(blockAtGivenNumber.id)
        }
        
        // TOO FAR AHEAD
        else if (givenBlock.number - lastSeenBlockNumber > 1) {
            blockNumbersToEnqueue = range(lastSeenBlockNumber + 1, givenBlock.number)
            logger.warn(`GAP IN BLOCKS - Playing catch up for blocks ${blockNumbersToEnqueue}.`)
        }

        handleNewBlocks(chainId, blockNumbersToEnqueue)
    } catch (err) {
        logger.error('Error fetching existing IndexerDB state', err)
    }
}

export default processNewHead