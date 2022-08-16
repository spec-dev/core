import { EthTransaction, EthBlock, normalizeEthAddress, normalize32ByteHash, hexToNumber, toString, hexToNumberString, normalizeByteData } from 'shared'
import { ExternalEthReceipt, ExternalEthTransaction } from '../types'

export function externalToInternalTransaction(
    externalTransaction: ExternalEthTransaction,
    receipt: ExternalEthReceipt | null,
    block: EthBlock,
): EthTransaction {
    const transaction = new EthTransaction()
    transaction.hash = externalTransaction.hash
    transaction.nonce = externalTransaction.nonce
    transaction.transactionIndex = externalTransaction.transactionIndex
    transaction.from = normalizeEthAddress(externalTransaction.from)
    transaction.to = normalizeEthAddress(externalTransaction.to)
    transaction.contractAddress = normalizeEthAddress(receipt.contractAddress)
    transaction.value = externalTransaction.value
    transaction.input = normalizeByteData(externalTransaction.input)
    transaction.transactionType = externalTransaction.type
    transaction.status = hexToNumber(receipt.status)
    transaction.root = normalize32ByteHash(receipt.root)
    transaction.gas = toString(externalTransaction.gas) || null
    transaction.gasPrice = externalTransaction.gasPrice
    transaction.maxFeePerGas = externalTransaction.maxFeePerGas
    transaction.maxPriorityFeePerGas = externalTransaction.maxPriorityFeePerGas
    transaction.gasUsed = hexToNumberString(receipt.gasUsed)
    transaction.cumulativeGasUsed = hexToNumberString(receipt.cumulativeGasUsed)
    transaction.effectiveGasPrice = hexToNumberString(receipt.effectiveGasPrice)
    transaction.blockHash = block.hash
    transaction.blockNumber = block.number
    transaction.blockTimestamp = block.timestamp
    return transaction
}