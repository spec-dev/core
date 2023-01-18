import { EthTransaction, StringKeyMap } from '../../../../../shared'

const eventName = 'eth.NewTransactions@0.0.1'

function NewTransactions(txs: EthTransaction[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = txs.map((tx) => ({
        ...tx,
        blockNumber: Number(tx.blockNumber),
        blockTimestamp: tx.blockTimestamp.toISOString(),
    }))

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewTransactions