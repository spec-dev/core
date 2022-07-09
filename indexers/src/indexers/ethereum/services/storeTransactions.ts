import { TransactionReceipt } from '@alch/alchemy-web3'
import { Transaction } from 'web3-eth'

async function storeTransactions(
    internalBlock: Block, 
    externalTransactions: Transaction[], 
    receipts: TransactionReceipt[],
): Promise<Transaction[]> {
    
}

export default storeTransactions