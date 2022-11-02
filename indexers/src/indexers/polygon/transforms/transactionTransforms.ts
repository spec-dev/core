import {
    PolygonTransaction,
    PolygonBlock,
    normalizeEthAddress,
    hexToNumber,
    toString,
    hexToNumberString,
    normalizeByteData,
} from '../../../../../shared'
import { ExternalPolygonReceipt, ExternalPolygonTransaction } from '../types'

export function externalToInternalTransaction(
    externalTransaction: ExternalPolygonTransaction,
    receipt: ExternalPolygonReceipt | null,
    block: PolygonBlock
): PolygonTransaction {
    const transaction = new PolygonTransaction()
    transaction.hash = externalTransaction.hash
    transaction.nonce = externalTransaction.nonce
    transaction.transactionIndex = externalTransaction.transactionIndex
    transaction.from = normalizeEthAddress(externalTransaction.from)
    transaction.to = normalizeEthAddress(externalTransaction.to)
    transaction.contractAddress = receipt ? normalizeEthAddress(receipt?.contractAddress) : null
    transaction.value = externalTransaction.value
    transaction.input = normalizeByteData(externalTransaction.input)
    transaction.functionName = null
    transaction.functionArgs = null
    transaction.transactionType = externalTransaction.type
    transaction.status = receipt ? hexToNumber(receipt?.status) : null
    transaction.gas = toString(externalTransaction.gas) || null
    transaction.gasPrice = externalTransaction.gasPrice
    transaction.maxFeePerGas = externalTransaction.maxFeePerGas
    transaction.maxPriorityFeePerGas = externalTransaction.maxPriorityFeePerGas
    transaction.gasUsed = receipt ? hexToNumberString(receipt?.gasUsed) : null
    transaction.cumulativeGasUsed = receipt ? hexToNumberString(receipt?.cumulativeGasUsed) : null
    transaction.effectiveGasPrice = receipt ? hexToNumberString(receipt?.effectiveGasPrice) : null
    transaction.blockHash = block.hash
    transaction.blockNumber = block.number
    transaction.blockTimestamp = block.timestamp
    return transaction
}
