import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { ExternalEthBlock } from '../types'
import { EthBlock, logger, sleep } from '../../../../../shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'
import config from '../../../config'

export async function resolveBlock(
    web3: AlchemyWeb3,
    blockNumber: number,
    chainId: string
): Promise<[ExternalEthBlock, EthBlock]> {
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
    web3: AlchemyWeb3,
    blockNumber: number | string
): Promise<ExternalEthBlock | null> {
    let externalBlock: ExternalEthBlock
    let error
    try {
        externalBlock = (await web3.eth.getBlock(
            blockNumber,
            true
        )) as unknown as ExternalEthBlock
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
