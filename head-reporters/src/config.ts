import { ev, config, StringKeyMap } from '../../shared'

const alchemySubUrl = ev('ALCHEMY_SUBSCRIPTION_URL')

const hrConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: ev('CHAIN_ID'),
    ALCHEMY_SUBSCRIPTION_URL: alchemySubUrl ? alchemySubUrl : `wss://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    HEAD_BUFFER: Number(ev('HEAD_BUFFER', 2)),
}

export default hrConfig