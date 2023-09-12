import { EthBlock, StringKeyMap, namespaceForChainId } from '../../../../../shared'

function NewBlock(block: EthBlock, eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = {
        ...block,
        number: Number(block.number),
        timestamp: block.timestamp.toISOString(),
    }

    return {
        name: `${namespaceForChainId[eventOrigin.chainId]}.NewBlock@0.0.1`,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewBlock