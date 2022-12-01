import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { ExternalEthBlock } from '../types'
import { EthBlock, logger, sleep } from '../../../../../shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'
import { shouldRetryOnWeb3ProviderError } from '../../../errors'
import config from '../../../config'

export async function resolveBlock(
    web3: AlchemyWeb3,
    blockNumberOrHash: number | string,
    blockNumber: number,
    chainId: string
): Promise<[ExternalEthBlock, EthBlock]> {
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
): Promise<ExternalEthBlock | null> {
    let externalBlock: ExternalEthBlock
    let error
    try {
        externalBlock = (await web3.eth.getBlock(
            blockNumberOrHash,
            true
        )) as unknown as ExternalEthBlock
    } catch (err) {
        error = err
    }
    if (error) {
        config.IS_RANGE_MODE ||
            logger.error(`Error fetching block ${blockNumberOrHash}: ${error}. Will retry.`)
        return null
    }

    return externalBlock
    // if (error && shouldRetryOnWeb3ProviderError(error)) {
    //     return null
    // } else if (error) {
    //     throw error
    // } else {
    //     return externalBlock
    // }
}

export default resolveBlock
