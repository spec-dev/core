import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { ExternalEthBlock } from '../types'
import { EthBlock, logger, sleep } from 'shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
}

export async function resolveBlock(
    web3: AlchemyWeb3,
    blockNumberOrHash: number | string,
    blockNumber: number,
    chainId: number,
): Promise<[ExternalEthBlock, EthBlock]> {
    let externalBlock = null
    let numAttempts = 0
    try {
        while (externalBlock === null && numAttempts < timing.MAX_ATTEMPTS) {
            externalBlock = await fetchBlock(web3, blockNumberOrHash)
            if (externalBlock === null) {
                await sleep(timing.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
    } catch (err) {
        throw `Error fetching block ${blockNumberOrHash}: ${err}`
    }

    if (externalBlock === null) {
        // TODO: Need to re-enqueue block to retry with top priority
        throw `Out of attempts - No block found for ${blockNumber}...`
    }

    logger.info(`[${chainId}:${blockNumber}] Got block with txs.`)
    return [externalBlock, externalToInternalBlock(externalBlock, chainId)]
}

export async function fetchBlock(web3: AlchemyWeb3, blockNumberOrHash: number | string): Promise<ExternalEthBlock | null> {
    let externalBlock: ExternalEthBlock
    let error
    try {
        externalBlock = await web3.eth.getBlock(blockNumberOrHash, true) as unknown as ExternalEthBlock
    } catch (err) {
        error = err
    }

    if (error && error.message && (
        error.message.toLowerCase().includes('getaddrinfo enotfound') || 
        error.message.toLowerCase().includes('etimedout'))) {
        return null
    } else if (error) {
        throw error
    } else {
        return externalBlock
    }
}

export default resolveBlock