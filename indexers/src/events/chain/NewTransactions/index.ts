import { EthTransaction, StringKeyMap, namespaceForChainId } from '../../../../../shared'

function NewTransactions(txs: EthTransaction[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = txs.map((tx) => ({
        ...tx,
        blockNumber: Number(tx.blockNumber),
        blockTimestamp: tx.blockTimestamp.toISOString(),
    }))

    return {
        name: `${namespaceForChainId[eventOrigin.chainId]}.NewTransactions@0.0.1`,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewTransactions