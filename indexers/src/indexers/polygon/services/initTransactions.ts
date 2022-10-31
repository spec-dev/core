import { PolygonBlock, PolygonTransaction, mapByKey } from '../../../../../shared'
import { externalToInternalTransaction } from '../transforms/transactionTransforms'
import { ExternalPolygonTransaction, ExternalPolygonReceipt } from '../types'

function initTransactions(
    block: PolygonBlock,
    externalTransactions: ExternalPolygonTransaction[],
    receipts: ExternalPolygonReceipt[]
): PolygonTransaction[] {
    // Index receipts by transaction hash.
    const receiptsMap = mapByKey(receipts || [], 'transactionHash')

    return externalTransactions.map((t) =>
        externalToInternalTransaction(t, receiptsMap[t.hash] || null, block)
    )
}

export default initTransactions
