import {
    logger,
    StringKeyMap,
    TRANSFER_TOPIC,
    splitLogDataToWords,
    normalizeEthAddress,
    hexToNumberString,
} from '../../../shared'

function extractTransfersFromLogs(logs: StringKeyMap[]): StringKeyMap[] {
    const transferLogs = logs.filter(log => log.topic0 === TRANSFER_TOPIC)
    
    const transfers = []
    for (const log of transferLogs) {
        const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
        const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
        if (topicsWithData.length !== 4) continue
        
        let from, to, value
        try {
            from = normalizeEthAddress(topicsWithData[1], true, true)
            to = normalizeEthAddress(topicsWithData[2], true, true)
            value = hexToNumberString(topicsWithData[3])    
        } catch (err) {
            logger.error(`Error extracting transfer event params: ${err}`)
            continue
        }

        transfers.push({ log, from, to, value })
    }
    
    return transfers
}

export default extractTransfersFromLogs