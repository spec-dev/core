import { ExternalPolygonBlock } from '../types'
import { PolygonBlock, logger, sleep } from '../../../../../shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'
import config from '../../../config'
import Web3 from 'web3'

export async function resolveBlock(
    web3: Web3,
    blockNumber: number,
    chainId: string,
): Promise<[ExternalPolygonBlock, PolygonBlock]> {
    let externalBlock = null
    let numAttempts = 0
    try {
        while (externalBlock === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            externalBlock = await fetchBlock(web3, blockNumber)
            if (externalBlock === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching block ${blockNumber}: ${err}`
    }

    if (externalBlock === null) {
        throw `Out of attempts - No block found for ${blockNumber}...`
    }

    config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got block with txs.`)

    return [externalBlock, externalToInternalBlock(externalBlock)]
}

export async function fetchBlock(
    web3: Web3,
    blockNumber: number,
): Promise<ExternalPolygonBlock | null> {
    let externalBlock: ExternalPolygonBlock
    let error
    try {
        externalBlock = (await web3.eth.getBlock(
            blockNumber,
            true
        )) as unknown as ExternalPolygonBlock
    } catch (err) {
        error = err
    }
    if (error) {
        config.IS_RANGE_MODE ||
            logger.error(`Error fetching block ${blockNumber}: ${error}. Will retry.`)
        return null
    }

    return externalBlock
}

export default resolveBlock
