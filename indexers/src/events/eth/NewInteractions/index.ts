import { EthLatestInteraction, StringKeyMap } from '../../../../../shared'

const eventName = 'eth.NewInteractions@0.0.1'

function NewInteractions(latestInteractions: EthLatestInteraction[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = latestInteractions.map((li) => ({
        ...li,
        blockNumber: Number(li.blockNumber),
        timestamp: li.timestamp.toISOString(),
    }))

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewInteractions