import config from '../config'
import { chainIds } from '../../../shared'

export const queueNameForChainId = {
    [chainIds.ETHEREUM]: config.ETHEREUM_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.GOERLI]: config.GOERLI_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.POLYGON]: config.POLYGON_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.MUMBAI]: config.MUMBAI_HEAD_REPORTER_QUEUE_KEY,
    [chainIds.BASE]: config.BASE_HEAD_REPORTER_QUEUE_KEY,
}