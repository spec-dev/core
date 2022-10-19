import { EthTransaction } from '../../../../../shared'
import { EthTransaction as Diff } from '@spec.types/spec'

function NewTransactions(txs: EthTransaction[]): Diff[] {
    return txs.map((tx) => ({
        ...tx,
        blockNumber: Number(tx.blockNumber),
        blockTimestamp: tx.blockTimestamp.toISOString(),
    }))
}

export default NewTransactions
