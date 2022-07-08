import { ev, config, isNumber } from 'shared'

const chainId = parseInt(ev('CHAIN_ID'))

export default {
    ...config,
    CHAIN_ID: isNumber(chainId) ? chainId : null,
    ALCHEMY_SUBSCRIPTION_URL: `wss://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
}