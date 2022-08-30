import { EthBlock, EthTransaction, mapByKey } from '../../../../../shared'
import { Transaction } from 'web3-eth'
import { TransactionReceipt } from '@alch/alchemy-web3'
import { externalToInternalTransaction } from '../transforms/transactionTransforms'
import { ExternalEthTransaction, ExternalEthReceipt } from '../types'

function initTransactions(
    block: EthBlock,
    externalTransactions: ExternalEthTransaction[],
    receipts: ExternalEthReceipt[]
): EthTransaction[] {
    // Index receipts by transaction hash.
    const receiptsMap = mapByKey(receipts || [], 'transactionHash')

    return externalTransactions.map((t) =>
        externalToInternalTransaction(t, receiptsMap[t.hash] || null, block)
    )
}

export default initTransactions
