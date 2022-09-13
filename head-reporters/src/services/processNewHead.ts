import { BlockHeader } from 'web3-eth'
import {
    getlastSeenBlock,
    getBlockAtNumber,
    createIndexedBlock,
    uncleBlock,
    logger,
} from '../../../shared'
import { reportBlock } from '../queue'

interface NewBlockSpec {
    number: number
    hash: string | null
}

// Keep list of last 5 block numbers seen.
const recentlySeenBlockNumbers = []
const registerNumberAsSeen = (blockNumber: number) => {
    recentlySeenBlockNumbers.unshift(blockNumber)
    if (recentlySeenBlockNumbers.length > 5) {
        recentlySeenBlockNumbers.pop()
    }
}

async function processNewHead(chainId: number, givenBlock: BlockHeader) {
    registerNumberAsSeen(givenBlock.number)

    // Get the last seen block + the non-uncled block for the given block number (if it exists).
    let lastSeenBlock, blockAtGivenNumber
    try {
        ;[lastSeenBlock, blockAtGivenNumber] = await Promise.all([
            getlastSeenBlock(chainId),
            getBlockAtNumber(chainId, givenBlock.number),
        ])
    } catch (err) {
        logger.error('Error fetching existing IndexerDB state', err)
        return
    }

    const lastSeenBlockNumber = lastSeenBlock?.number || givenBlock.number - 1
    let newBlockSpecs: NewBlockSpec[] = [{ hash: givenBlock.hash, number: givenBlock.number }]
    let replace = false // replace only if replacing uncled block.

    try {
        // REORG -- BEHIND.
        if (givenBlock.number <= lastSeenBlockNumber) {
            logger.warn(`REORG DETECTED - Marking block ${givenBlock.number} as uncled.`)
            blockAtGivenNumber && uncleBlock(blockAtGivenNumber)
            replace = true
        }

        // TOO FAR AHEAD
        else if (givenBlock.number - lastSeenBlockNumber > 1) {
            newBlockSpecs = []
            for (let i = lastSeenBlockNumber + 1; i < givenBlock.number + 1; i++) {
                if (i === givenBlock.number) {
                    newBlockSpecs.push({ hash: givenBlock.hash, number: givenBlock.number })
                } else if (recentlySeenBlockNumbers.includes(i)) {
                    continue // Previous block is probably just still processing here (race condition)
                } else {
                    newBlockSpecs.push({ hash: null, number: i })
                }
            }
            logger.warn(
                `GAP IN BLOCKS - Playing catch up for blocks ${newBlockSpecs
                    .map((s) => s.number)
                    .join(', ')}.`
            )
        }

        newBlockSpecs = newBlockSpecs.sort((a, b) => a.number - b.number)
        await handleNewBlocks(chainId, newBlockSpecs, 0, replace)
    } catch (err) {
        logger.error(`Error processing new head at block number ${givenBlock.number}`, err)
    }
}

async function handleNewBlocks(
    chainId: number,
    blockSpecs: NewBlockSpec[],
    i: number,
    replace = false
) {
    const { number, hash } = blockSpecs[i]

    // Create new IndexedBlock record.
    const block = await createIndexedBlock({ chainId, number, hash })

    // Enqueue block to be processed.
    await reportBlock(block, replace)

    // Recurse.
    if (i < blockSpecs.length - 1) {
        setTimeout(() => handleNewBlocks(chainId, blockSpecs, i + 1, replace), 200)
    }
}

export default processNewHead
