import { EthTransaction, EthBlock, normalizeEthAddress, normalize32ByteHash, hexToNumber, toString, normalizeByteData } from 'shared'
import { ExternalEthReceipt, ExternalEthTransaction } from '../types'

export function externalToInternalTransaction(
    externalTransaction: ExternalEthTransaction,
    receipt: ExternalEthReceipt | null,
    block: EthBlock,
): EthTransaction {
    const transaction = new EthTransaction()
    transaction.chainId = block.chainId
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
    transaction.gasUsed = toString(hexToNumber(receipt.gasUsed)) || null
    transaction.cumulativeGasUsed = toString(hexToNumber(receipt.cumulativeGasUsed)) || null
    transaction.effectiveGasPrice = toString(hexToNumber(receipt.effectiveGasPrice)) || null
    transaction.blockHash = block.hash
    transaction.blockNumber = block.number
    transaction.blockTimestamp = block.timestamp
    transaction.uncled = block.uncled
    return transaction
}