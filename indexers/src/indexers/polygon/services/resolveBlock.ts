import { ExternalPolygonBlock } from '../types'
import { PolygonBlock, logger, sleep } from '../../../../../shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'
import config from '../../../config'
import Web3 from 'web3'

export async function resolveBlock(
    web3: Web3,
    blockHash: string,
    blockNumber: number,
    chainId: string,
): Promise<[ExternalPolygonBlock, PolygonBlock]> {
    const blockId = blockHash || blockNumber

    let externalBlock = null
    let numAttempts = 0
    try {
        while (externalBlock === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            externalBlock = await fetchBlock(web3, blockId)
            if (externalBlock === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching block ${blockId}: ${err}`
    }

    if (externalBlock === null) {
        throw `Out of attempts - No block found for ${blockId}...`
    }

    config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got block with txs.`)

    return [externalBlock, externalToInternalBlock(externalBlock)]
}

export async function fetchBlock(
    web3: Web3,
    blockId: number | string,
): Promise<ExternalPolygonBlock | null> {
    let externalBlock: ExternalPolygonBlock
    let error
    try {
        externalBlock = (await web3.eth.getBlock(
            blockId,
            true
        )) as unknown as ExternalPolygonBlock
    } catch (err) {
        error = err
    }
    if (error) {
        config.IS_RANGE_MODE ||
            logger.error(`Error fetching block ${blockId}: ${error}. Will retry.`)
        return null
    }

    return externalBlock
}

export default resolveBlock
