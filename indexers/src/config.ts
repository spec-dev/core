import { ev, config, isNumber } from 'shared'

const chainId = parseInt(ev('CHAIN_ID'))

export default {
    ...config,
    CHAIN_ID: isNumber(chainId) ? chainId : null,
    ALCHEMY_ETH_MAINNET_REST_URL: `https://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    EVENT_RELAY_HOSTNAME: ev('EVENT_RELAY_HOSTNAME'),
}