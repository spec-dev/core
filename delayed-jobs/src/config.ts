import { ev, config, StringKeyMap } from '../../shared'

const delayedJobsConfig: StringKeyMap = {
    ...config,
    DELAYED_JOB_CONCURRENCY_LIMIT: Number(ev('DELAYED_JOB_CONCURRENCY_LIMIT', 10)),
    QUERY_BLOCK_RANGE_SIZE: Number(ev('QUERY_BLOCK_RANGE_SIZE', 1000)),
    JOB_BLOCK_RANGE_SIZE: Number(ev('JOB_BLOCK_RANGE_SIZE', 10000)),
    MAX_DECODE_PARALLELIZATION: Number(ev('MAX_DECODE_PARALLELIZATION', 10)),
    DECODE_RANGE_SIZE: Number(ev('DECODE_RANGE_SIZE', 1000000)),
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
    GOERLISCAN_API_KEY: ev('GOERLISCAN_API_KEY'),
    POLYGONSCAN_API_KEY: ev('POLYGONSCAN_API_KEY'),
    MUMBAISCAN_API_KEY: ev('MUMBAISCAN_API_KEY'),
    POLYGON_ALCHEMY_REST_URL: ev('POLYGON_ALCHEMY_REST_URL'),
    MUMBAI_ALCHEMY_REST_URL: ev('MUMBAI_ALCHEMY_REST_URL'),
    EVENT_GEN_AUTH_HEADER_NAME: 'Spec-Auth-Token',
    EVENT_GENERATORS_JWT: ev('EVENT_GENERATORS_JWT'),
    TABLES_AUTH_HEADER_NAME: 'Spec-Tables-Auth-Token',
    MAX_CONTRACT_REGISTRATION_STACK_HEIGHT: 100,
}

export default delayedJobsConfig
