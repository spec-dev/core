import Web3 from 'web3'
import config from './config'

let web3 = null
export const getSocketWeb3 = (): Web3 => {
    if (!config.ALCHEMY_SUBSCRIPTION_URL) return null
    web3 = web3 || new Web3(new Web3.providers.WebsocketProvider(config.ALCHEMY_SUBSCRIPTION_URL, {
        clientConfig: {
            keepalive: true,
            keepaliveInterval: 60000,
        },
        reconnect: {
            auto: true,
            delay: 5000,
            maxAttempts: 5,
            onTimeout: false,
        },
    }))
    return web3
}