import { ev, config, isNumber } from 'shared'

const chainId = parseInt(ev('CHAIN_ID'))

export default {
    ...config,
    CHAIN_ID: isNumber(chainId) ? chainId : null,
}