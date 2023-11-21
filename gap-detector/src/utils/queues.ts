import config from '../config'
import { chainIds } from '../../../shared'

export const queueNameForChainId = {
    [chainIds.ETHEREUM]: config.ETHEREUM_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.GOERLI]: config.GOERLI_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.POLYGON]: config.POLYGON_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.MUMBAI]: config.MUMBAI_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.BASE]: config.BASE_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.OPTIMISM]: config.OPTIMISM_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.ARBITRUM]: config.ARBITRUM_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.PGN]: config.PGN_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.CELO]: config.CELO_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.LINEA]: config.LINEA_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.SEPOLIA]: config.SEPOLIA_HEAD_REPORTER_QUEUE_KEY,
}