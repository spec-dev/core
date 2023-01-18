import { EthBlock, StringKeyMap } from '../../../../../shared'

const eventName = 'eth.NewBlock@0.0.1'

function NewBlock(block: EthBlock, eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = {
        ...block,
        number: Number(block.number),
        timestamp: block.timestamp.toISOString(),
    }

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewBlock