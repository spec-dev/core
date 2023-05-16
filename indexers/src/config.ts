import { ev, config, isNumber, StringKeyMap } from '../../shared'

const parseBlockRangeBoundary = (envVar: string): number | null => {
    let boundary = parseInt(ev(envVar))
    return isNumber(boundary) ? boundary : null
}

const specificIndexNumbers = (ev('SPECIFIC_INDEX_NUMBERS') || '')
    .split(',').map(v => v.trim()).filter(v => v!!).map(v => parseInt(v))

const from = parseBlockRangeBoundary('FROM')
const to = parseBlockRangeBoundary('TO')
const isRangeMode = (from !== null && to !== null) || !!specificIndexNumbers.length

const alchemyRestUrl = ev('ALCHEMY_REST_URL')
const alchemySubUrl = ev('ALCHEMY_SUBSCRIPTION_URL')

const indexerConfig: StringKeyMap = {
    ...config,
    ALCHEMY_API_KEY: ev('ALCHEMY_API_KEY'),
    ALCHEMY_REST_URL: alchemyRestUrl ? alchemyRestUrl : `https://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    ALCHEMY_SUBSCRIPTION_URL: alchemySubUrl ? alchemySubUrl : `wss://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    QUICKNODE_REST_URL: ev('QUICKNODE_REST_URL'),
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    FROM: from,
    TO: to,
    IS_RANGE_MODE: isRangeMode,
    RANGE_WORKER_TYPE: ev('RANGE_WORKER_TYPE') || 'range',
    RANGE_GROUP_SIZE: Number(ev('RANGE_GROUP_SIZE', 10)),
    SPECIFIC_INDEX_NUMBERS: specificIndexNumbers,
    HEAD_JOB_CONCURRENCY_LIMIT: Number(ev('HEAD_JOB_CONCURRENCY_LIMIT', 1)),
    SAVE_BATCH_MULTIPLE: Number(ev('SAVE_BATCH_MULTIPLE', 15)),
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
    EXPO_BACKOFF_DELAY: 200,
    EXPO_BACKOFF_MAX_ATTEMPTS: 10,
    EXPO_BACKOFF_FACTOR: 1.5,
    MAX_BINDINGS_SIZE: 1000,
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
    MAX_TABLE_SAVE_TIME: Number(ev('MAX_TABLE_SAVE_TIME', 30000)),
    CMC_API_KEY: ev('CMC_API_KEY'),
    RPC_POOL_ENDPOINTS: ev('RPC_POOL_ENDPOINTS'),
    RPC_FUNCTION_BATCH_SIZE: Number(ev('RPC_FUNCTION_BATCH_SIZE', 100)),
}

export default indexerConfig
