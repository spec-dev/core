import { AlchemyWeb3 } from '@alch/alchemy-web3'
import { BlockTransactionObject } from 'web3-eth'

type Block = null

async function getAndStoreBlock(web3: AlchemyWeb3, blockNumber: number): Promise<[BlockTransactionObject, Block]> {
    // Get block by number.
    let externalBlock: BlockTransactionObject
    try {
        externalBlock = await web3.eth.getBlock(blockNumber, true)
    } catch (err) {
        throw `Error fetching block at number ${blockNumber}: ${err}`
    }
    
    // Upsert block in public tables and flush (ID WILL BE NEEDED).
    // ...
    
    return [externalBlock, null]
}

export default getAndStoreBlock