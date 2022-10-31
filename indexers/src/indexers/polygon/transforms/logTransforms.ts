import { PolygonLog, normalizeEthAddress, normalizeByteData, hexToNumber } from '../../../../../shared'
import { ExternalPolygonLog } from '../types'

export function externalToInternalLog(externalLog: ExternalPolygonLog, block: any): PolygonLog {
    const topics = externalLog.topics || []
    const log = new PolygonLog()
    log.logIndex = hexToNumber(externalLog.logIndex)
    log.transactionHash = externalLog.transactionHash
    log.transactionIndex = hexToNumber(externalLog.transactionIndex)
    log.address = normalizeEthAddress(externalLog.address)
    log.data = normalizeByteData(externalLog.data)
    log.topic0 = topics[0] || null
    log.topic1 = topics[1] || null
    log.topic2 = topics[2] || null
    log.topic3 = topics[3] || null
    log.eventName = null
    log.eventArgs = null
    log.blockHash = block.hash
    log.blockNumber = block.number
    log.blockTimestamp = block.timestamp
    return log
}
