import { ev, config, isNumber, StringKeyMap } from '../../shared'

const chainId = parseInt(ev('CHAIN_ID'))

const parseBlockRangeBoundary = (envVar: string): number | null => {
    let boundary = parseInt(ev(envVar))
    return isNumber(boundary) ? boundary : null
}

const from = parseBlockRangeBoundary('FROM')
const to = parseBlockRangeBoundary('TO')
const isRangeMode = from !== null && to !== null

const indexerConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: isNumber(chainId) ? chainId : null,
    ALCHEMY_ETH_MAINNET_REST_URL: `https://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    EVENT_RELAY_HOSTNAME: ev('EVENT_RELAY_HOSTNAME', 'events.spec.dev'),
    EVENT_RELAY_PORT: Number(ev('EVENT_RELAY_PORT', 443)),
    FROM: from,
    TO: to,
    IS_RANGE_MODE: isRangeMode,
    RANGE_WORKER_TYPE: ev('RANGE_WORKER_TYPE') || 'range',
    RANGE_GROUP_SIZE: Number(ev('RANGE_GROUP_SIZE', 10)),
    HEAD_JOB_CONCURRENCY_LIMIT: Number(ev('HEAD_JOB_CONCURRENCY_LIMIT', 3)),
    SAVE_BATCH_MULTIPLE: Number(ev('SAVE_BATCH_MULTIPLE', 15)),
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
    MAX_BINDINGS_SIZE: 2000,
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
}

export default indexerConfig
