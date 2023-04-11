import { StringKeyMap, TokenTransfer } from '../../../../../shared'

const eventName = 'tokens.NewTokenTransfers@0.0.1'

function NewTokenTransfers(tokenTransfers: TokenTransfer[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = tokenTransfers.map((t) => ({
        ...t,
        blockNumber: Number(t.blockNumber),
        blockTimestamp: t.blockTimestamp.toISOString(),
    }))

    console.log(eventData)

    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewTokenTransfers