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
} from '../utils/standardAbis'
import Web3 from 'web3'

const web3 = new Web3()

const batchTransferInputs = [
    {
        name: 'operator',
        type: 'address'
    },
    {
        name: 'from',
        type: 'address'
    },
    {
        name: 'to',
        type: 'address'
    },
    {
        name: 'ids',
        type: 'uint256[]'
    },
    {
        name: 'values',
        type: 'uint256[]'
    }
]

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

function extractTransferEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []
    for (const log of logs) {
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

function extractTransferSingleEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []

    for (const log of logs) {
        const topics = [log.topic0, log.topic1, log.topic2, log.topic3].filter(t => t !== null)
        const topicsWithData = [...topics, ...splitLogDataToWords(log.data)]
        if (topicsWithData.length !== 6) continue
        
        let from, to, tokenId
        try {
            from = normalizeEthAddress(topicsWithData[2], true, true)
            to = normalizeEthAddress(topicsWithData[3], true, true)
            tokenId = hexToNumberString(topicsWithData[4])
        } catch (err) {
            logger.error(`Error extracting transfer event params: ${err}`)
            continue
        }
        
        transfers.push({ log, from, to, tokenId })
    }

    return transfers
}

export function extractTransferBatchEvents(logs: StringKeyMap[]): StringKeyMap[] {
    const transfers = []

    for (const log of logs) {
        const topics = [log.topic1, log.topic2, log.topic3].filter(t => t !== null)
        const abiInputs = []
        for (let i = 0; i < batchTransferInputs.length; i++) {
            abiInputs.push({ 
                ...batchTransferInputs[i], 
                indexed: i < topics.length,
            })
        }

        let args
        try {
            args = web3.eth.abi.decodeLog(abiInputs as any, log.data, topics)
        } catch (err) {
            logger.error(`Error extracting batch transfer event params: ${err} for log`, log)
            continue
        }

        const numArgs = parseInt(args.__length__)
        const argValues = []
        for (let i = 0; i < numArgs; i++) {
            const stringIndex = i.toString()
            if (!args.hasOwnProperty(stringIndex)) continue
            argValues.push(args[stringIndex])
        }

        if (argValues.length !== abiInputs.length) {
            logger.error(`Length mismatch when parsing batch transfer event params: ${argValues}`)
            continue
        }
        
        const [from, to, tokenIds] = [
            normalizeEthAddress(argValues[1]),
            normalizeEthAddress(argValues[2]),
            argValues[3] || []
        ]

        tokenIds.forEach(tokenId => {
            transfers.push({ log, from, to, tokenId })
        })
    }

    return transfers
}

export default extractTransfersFromLogs