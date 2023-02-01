import {
    logger,
    StringKeyMap,
    splitLogDataToWords,
    normalizeEthAddress,
    hexToNumberString,
} from '../../../shared'
import { 
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    BATCH_TRANSFER_INPUTS,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
} from '../utils/standardAbis'
import Web3 from 'web3'

const web3 = new Web3()

function extractTransfersFromLogs(logs: StringKeyMap[]): StringKeyMap[] {
    const transferEvents = []
    const transferSingleEvents = []
    const transferBatchEvents = []

    for (const log of logs) {
        switch (log.topic0) {
            case TRANSFER_TOPIC: 
                transferEvents.push(log)
                break
            case TRANSFER_SINGLE_TOPIC:
                transferSingleEvents.push(log)
                break
            case TRANSFER_BATCH_TOPIC:
                transferBatchEvents.push(log)
                break
            default:
                break
        }
    }

    return [
        ...extractTransferEvents(transferEvents),
        ...extractTransferSingleEvents(transferSingleEvents),
        ...extractTransferBatchEvents(transferBatchEvents),
    ]
}

export function extractTransferEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []
    for (const log of logs) {
        const decoded = decodeTransferEvent(log)
        if (!decoded) continue
        const { from, to, value } = decoded as StringKeyMap
        transfers.push({ log, from, to, value })
    }
    return transfers
}

export function extractTransferSingleEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []
    for (const log of logs) {
        const decoded = decodeTransferSingleEvent(log)
        if (!decoded) continue
        const { from, to, id } = decoded as StringKeyMap
        transfers.push({ log, from, to, tokenId: id })        
    }
    return transfers
}

export function extractTransferBatchEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []
    for (const log of logs) {
        const decoded = decodeTransferBatchEvent(log)
        if (!decoded) continue
        const { from, to, ids } = decoded as StringKeyMap
        ids.forEach(tokenId => {
            transfers.push({ log, from, to, tokenId })
        })
    }
    return transfers
}

export function decodeTransferEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 4) return null
    
    let from, to, value
    try {
        from = normalizeEthAddress(topicsWithData[1], true, true)
        to = normalizeEthAddress(topicsWithData[2], true, true)
        value = hexToNumberString(topicsWithData[3])    
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_EVENT_NAME} event params: ${err}`)
        return null
    }

    if (formatAsEventArgs) {
        return [
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'value', type: 'uint256', value: value },
        ]
    }

    return { from, to, value }
}

export function decodeTransferSingleEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
    if (topicsWithData.length !== 6) return null
    
    let operator, from, to, id, value 
    try {
        operator = normalizeEthAddress(topicsWithData[1], true, true)
        from = normalizeEthAddress(topicsWithData[2], true, true)
        to = normalizeEthAddress(topicsWithData[3], true, true)
        id = hexToNumberString(topicsWithData[4])
        value = hexToNumberString(topicsWithData[5])
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_SINGLE_EVENT_NAME} event params: ${err}`)
        return null
    }

    if (formatAsEventArgs) {
        return [
            { name: 'operator', type: 'address', value: operator },
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'id', type: 'uint256', value: id },
            { name: 'value', type: 'uint256', value: value },
        ]
    }

    return { operator, from, to, id, value }
}

export function decodeTransferBatchEvent(
    log: StringKeyMap, 
    formatAsEventArgs: boolean = false,
): StringKeyMap | StringKeyMap[] | null {
    const topics = [log.topic1, log.topic2, log.topic3].filter(t => t !== null)
    const abiInputs = []
    for (let i = 0; i < BATCH_TRANSFER_INPUTS.length; i++) {
        abiInputs.push({ 
            ...BATCH_TRANSFER_INPUTS[i], 
            indexed: i < topics.length,
        })
    }

    let args
    try {
        args = web3.eth.abi.decodeLog(abiInputs as any, log.data, topics)
    } catch (err) {
        logger.error(`Error extracting ${TRANSFER_BATCH_EVENT_NAME} event params: ${err} for log`, log)
        return null
    }

    const numArgs = parseInt(args.__length__)
    const argValues = []
    for (let i = 0; i < numArgs; i++) {
        const stringIndex = i.toString()
        if (!args.hasOwnProperty(stringIndex)) continue
        argValues.push(args[stringIndex])
    }

    if (argValues.length !== abiInputs.length) {
        logger.error(`Length mismatch when parsing ${TRANSFER_BATCH_EVENT_NAME} event params: ${argValues}`)
        return null
    }
    
    const [operator, from, to, ids, values] = [
        normalizeEthAddress(argValues[0]),
        normalizeEthAddress(argValues[1]),
        normalizeEthAddress(argValues[2]),
        argValues[3] || [],
        argValues[4] || []
    ]

    if (formatAsEventArgs) {
        return [
            { name: 'operator', type: 'address', value: operator },
            { name: 'from', type: 'address', value: from },
            { name: 'to', type: 'address', value: to },
            { name: 'ids', type: 'uint256[]', value: ids },
            { name: 'values', type: 'uint256[]', value: values },
        ]
    }

    return { operator, from, to, ids, values }
}

export default extractTransfersFromLogs