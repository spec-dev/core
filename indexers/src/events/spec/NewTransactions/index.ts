import { EthTransaction, StringKeyMap } from '../../../../../shared'

function NewTransactions(txs: EthTransaction[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = txs.map((tx) => ({
        ...tx,
        blockNumber: Number(tx.blockNumber),
        blockTimestamp: tx.blockTimestamp.toISOString(),
        chainId: eventOrigin.chainId,
    }))

    return {
        name: `spec.NewTransactions@0.0.1`,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewTransactions