import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { ExternalPolygonBlock } from '../types'
import { PolygonBlock, logger, sleep } from '../../../../../shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'
import config from '../../../config'

export async function resolveBlock(
    web3: AlchemyWeb3,
    blockNumberOrHash: number | string,
    blockNumber: number,
    chainId: string,
): Promise<[ExternalPolygonBlock, PolygonBlock]> {
    let externalBlock = null
    let numAttempts = 0
    try {
        while (externalBlock === null && numAttempts < config.MAX_ATTEMPTS) {
            externalBlock = await fetchBlock(web3, blockNumberOrHash)
            if (externalBlock === null) {
                await sleep(config.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching block ${blockNumberOrHash}: ${err}`
    }

    if (externalBlock === null) {
        throw `Out of attempts - No block found for ${blockNumber}...`
    }

    config.IS_RANGE_MODE || logger.info(`[${chainId}:${blockNumber}] Got block with txs.`)

    return [externalBlock, externalToInternalBlock(externalBlock)]
}

export async function fetchBlock(
    web3: AlchemyWeb3,
    blockNumberOrHash: number | string
): Promise<ExternalPolygonBlock | null> {
    let externalBlock: ExternalPolygonBlock
    let error
    try {
        externalBlock = (await web3.eth.getBlock(
            blockNumberOrHash,
            true
        )) as unknown as ExternalPolygonBlock
    } catch (err) {
        error = err
    }
    if (error) {
        config.IS_RANGE_MODE ||
            logger.error(`Error fetching block ${blockNumberOrHash}: ${error}. Will retry.`)
        return null
    }

    return externalBlock
}

export default resolveBlock
