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
    CHAIN_ID: ev('CHAIN_ID'),
    ALCHEMY_REST_URL: alchemyRestUrl ? alchemyRestUrl : `https://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    ALCHEMY_SUBSCRIPTION_URL: alchemySubUrl ? alchemySubUrl : `wss://eth-mainnet.g.alchemy.com/v2/${ev('ALCHEMY_API_KEY')}`,
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    EVENT_RELAY_HOSTNAME: ev('EVENT_RELAY_HOSTNAME', 'events.spec.dev'),
    EVENT_RELAY_PORT: Number(ev('EVENT_RELAY_PORT', 443)),
    FROM: from,
    TO: to,
    IS_RANGE_MODE: isRangeMode,
    RANGE_WORKER_TYPE: ev('RANGE_WORKER_TYPE') || 'range',
    RANGE_GROUP_SIZE: Number(ev('RANGE_GROUP_SIZE', 10)),
    SPECIFIC_INDEX_NUMBERS: specificIndexNumbers,
    HEAD_JOB_CONCURRENCY_LIMIT: Number(ev('HEAD_JOB_CONCURRENCY_LIMIT', 5)),
    SAVE_BATCH_MULTIPLE: Number(ev('SAVE_BATCH_MULTIPLE', 15)),
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
    MAX_BINDINGS_SIZE: 2000,
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
}

export default indexerConfig
