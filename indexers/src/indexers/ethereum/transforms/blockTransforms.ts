import { ExternalEthBlock } from '../types'
import { EthBlock, unixTimestampToDate, toString, normalizeEthAddress, normalize32ByteHash, normalizeByteData } from 'shared'

export function externalToInternalBlock(externalBlock: ExternalEthBlock, chainId: number): EthBlock {
    const block = new EthBlock()
    block.chainId = chainId
    block.number = externalBlock.number
    block.hash = externalBlock.hash
    block.parentHash = normalize32ByteHash(externalBlock.parentHash)
    block.nonce = externalBlock.nonce
    block.sha3Uncles = normalize32ByteHash(externalBlock.sha3Uncles)
    block.logsBloom = normalizeByteData(externalBlock.logsBloom)
    block.transactionsRoot = normalize32ByteHash(externalBlock.transactionsRoot)
    block.stateRoot = normalize32ByteHash(externalBlock.stateRoot)
    block.receiptsRoot = normalize32ByteHash(externalBlock.receiptsRoot)
    block.miner = normalizeEthAddress(externalBlock.miner)
    block.difficulty = externalBlock.difficulty
    block.totalDifficulty = externalBlock.totalDifficulty
    block.size = externalBlock.size
    block.extraData = normalizeByteData(externalBlock.extraData)
    block.gasLimit = toString(externalBlock.gasLimit) || null
    block.gasUsed = toString(externalBlock.gasUsed) || null
    block.baseFeePerGas = toString(externalBlock.baseFeePerGas) || null
    block.transactionCount = externalBlock.transactions?.length || 0
    block.timestamp = unixTimestampToDate(externalBlock.timestamp)
    return block
}