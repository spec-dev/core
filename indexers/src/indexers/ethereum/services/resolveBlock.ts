import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { ExternalEthBlock } from '../types'
import { BlockTransactionObject } from 'web3-eth'
import { EthBlock } from 'shared'
import { externalToInternalBlock } from '../transforms/blockTransforms'

export async function resolveBlock(
    web3: AlchemyWeb3,
    blockNumberOrHash: number | string,
    chainId: number,
): Promise<[ExternalEthBlock, EthBlock]> {
    let externalBlock: ExternalEthBlock
    try {
        externalBlock = await web3.eth.getBlock(blockNumberOrHash, true) as unknown as ExternalEthBlock
    } catch (err) {
        throw `Error fetching block ${blockNumberOrHash}: ${err}`
    }
    if (!externalBlock) {
        throw `Errror fetching block ${externalBlock}: no block found.`
    }

    return [externalBlock, externalToInternalBlock(externalBlock, chainId)]
}

export default resolveBlock