import { StringKeyMap, Erc20Balance } from '../../../../../shared'

const eventName = 'tokens.NewWethBalances@0.0.1'

function NewWethBalances(erc20Balances: Erc20Balance[], eventOrigin: StringKeyMap): StringKeyMap {
    const eventData = erc20Balances.map((b) => ({
        ...b,
        blockNumber: Number(b.blockNumber),
        blockTimestamp: b.blockTimestamp.toISOString(),
    }))
    return {
        name: eventName,
        data: eventData,
        origin: eventOrigin,
    }
}

export default NewWethBalances