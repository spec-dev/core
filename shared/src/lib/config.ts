import { ev, specEnvs } from './utils/env'
import { StringKeyMap } from './types'

const config: StringKeyMap = {
    ENV: ev('ENV', specEnvs.PROD),
    CHAIN_ID: ev('CHAIN_ID'),

    // Logging.
    BUGSNAG_API_KEY: ev('BUGSNAG_API_KEY'),

    // Indexer Redis Instance
    INDEXER_REDIS_HOST: ev('INDEXER_REDIS_HOST', 'localhost'),
    INDEXER_REDIS_PORT: Number(ev('INDEXER_REDIS_PORT', 6379)),
    DISABLE_REDIS: ev('DISABLE_REDIS'),

    // Indexer Postgres Instance
    INDEXER_DB_NAME: ev('INDEXER_DB_NAME', 'indexer'),
    INDEXER_DB_HOST: ev('INDEXER_DB_HOST', 'localhost'),
    INDEXER_DB_PORT: Number(ev('INDEXER_DB_PORT', 5432)),
    INDEXER_DB_USERNAME: ev('INDEXER_DB_USERNAME', 'spec'),
    INDEXER_DB_PASSWORD: ev('INDEXER_DB_PASSWORD', ''),
    INDEXER_DB_MAX_POOL_SIZE: Number(ev('INDEXER_DB_MAX_POOL_SIZE', 10)),

    JOB_DELAY_ON_FAILURE: Number(ev('JOB_DELAY_ON_FAILURE', 2000)),

    // Indexing job config.
    HEAD_REPORTER_QUEUE_KEY: ev('HEAD_REPORTER_QUEUE_KEY', 'head-reporter-queue'),
    INDEX_BLOCK_JOB_NAME: ev('INDEX_BLOCK_JOB_NAME', 'index-block'),
    INDEX_JOB_MAX_ATTEMPTS: Number(ev('INDEX_JOB_MAX_ATTEMPTS', 1)),
    INDEX_PERFORM_MAX_DURATION: Number(ev('INDEX_PERFORM_MAX_DURATION', 75000)),
    INDEX_PERFORM_MAX_ATTEMPTS: Number(ev('INDEX_PERFORM_MAX_ATTEMPTS', 100)),
    INDEX_JOB_LOCK_DURATION: Number(ev('INDEX_JOB_LOCK_DURATION', 45000)),

    // Cached events/calls for an indexed block.
    BLOCK_EVENTS_PREFIX: ev('BLOCK_EVENTS_PREFIX', 'block-events'),
    BLOCK_CALLS_PREFIX: ev('BLOCK_CALLS_PREFIX', 'block-calls'),

    // Event sorter job config.
    BLOCK_EVENTS_QUEUE_PREFIX: ev('BLOCK_EVENTS_QUEUE_KEY', 'block-events-queue'),
    SORT_BLOCK_EVENTS_JOB_NAME: ev('SORT_BLOCK_EVENTS_JOB_NAME', 'sort-block-events'),
    SORT_BLOCK_EVENTS_JOB_MAX_ATTEMPTS: Number(ev('SORT_BLOCK_EVENTS_JOB_MAX_ATTEMPTS', 1)),

    // Event generator job config.
    EVENT_GENERATOR_QUEUE_PREFIX: ev('EVENT_GENERATOR_QUEUE_PREFIX', 'event-gen-queue'),
    EVENT_GENERATOR_JOB_NAME: ev('EVENT_GENERATOR_JOB_NAME', 'event-gen'),
    EVENT_GENERATOR_JOB_MAX_ATTEMPTS: Number(ev('EVENT_GENERATOR_JOB_MAX_ATTEMPTS', 1)),

    // Event relay config.
    CONNECT_TO_EVENT_RELAY: [true, 'true'].includes(ev('CONNECT_TO_EVENT_RELAY', '').toLowerCase()),
    PUBLISHER_ROLE_KEY: ev('PUBLISHER_ROLE_KEY'),
    EVENT_RELAY_HOSTNAME: ev('EVENT_RELAY_HOSTNAME', 'events.spec.dev'),
    EVENT_RELAY_PORT: Number(ev('EVENT_RELAY_PORT', 443)),
    EVENT_GEN_AUTH_HEADER_NAME: 'Spec-Auth-Token',
    EVENT_GENERATORS_JWT: ev('EVENT_GENERATORS_JWT'),
    EVENT_GEN_RESPONSE_TIMEOUT: Number(ev('EVENT_GEN_RESPONSE_TIMEOUT', 60000)),
    TABLES_AUTH_HEADER_NAME: 'Spec-Tables-Auth-Token',
    REORG_EVENT_NAME_PREFIX: 'chain.reorgs',

    // Delayed job redis queue
    DELAYED_JOB_QUEUE_KEY: ev('DELAYED_JOB_QUEUE_KEY', 'djq'),

    // Public Tables Postgres Instance
    SHARED_TABLES_DB_NAME: ev('SHARED_TABLES_DB_NAME', 'shared-tables'),
    SHARED_TABLES_DB_HOST: ev('SHARED_TABLES_DB_HOST', 'localhost'),
    SHARED_TABLES_DB_PORT: Number(ev('SHARED_TABLES_DB_PORT', 5432)),
    SHARED_TABLES_DB_USERNAME: ev('SHARED_TABLES_DB_USERNAME', 'spec'),
    SHARED_TABLES_DB_PASSWORD: ev('SHARED_TABLES_DB_PASSWORD', ''),
    SHARED_TABLES_DB_URL: ev('SHARED_TABLES_DB_URL', ''),
    SHARED_TABLES_MIN_POOL_SIZE: Number(ev('SHARED_TABLES_MIN_POOL_SIZE', 2)),
    SHARED_TABLES_MAX_POOL_SIZE: Number(ev('SHARED_TABLES_MAX_POOL_SIZE', 10)),
    SHARED_TABLES_OPTIONS: ev('SHARED_TABLES_OPTIONS'),

    MAX_ATTEMPTS_DUE_TO_DEADLOCK: 10,

    // DAG Queue
    DAG_QUEUE_KEY: ev('DAG_QUEUE_KEY', 'dag-queue'),
    DAG_KEY: ev('DAG_KEY', 'dag'),

    // Core Postgres Instance
    CORE_DB_NAME: ev('CORE_DB_NAME', 'core'),
    CORE_DB_HOST: ev('CORE_DB_HOST', 'localhost'),
    CORE_DB_PORT: Number(ev('CORE_DB_PORT', 5432)),
    CORE_DB_USERNAME: ev('CORE_DB_USERNAME', 'spec'),
    CORE_DB_PASSWORD: ev('CORE_DB_PASSWORD', ''),
    CORE_DB_MAX_POOL_SIZE: Number(ev('CORE_DB_MAX_POOL_SIZE', 10)),

    // Core Redis Instance
    CORE_REDIS_HOST: ev('CORE_REDIS_HOST', 'localhost'),
    CORE_REDIS_PORT: Number(ev('CORE_REDIS_PORT', 6379)),
    CORE_REDIS_NODE_COUNT: 3,

    // ABI Store Redis Instance
    ABI_REDIS_HOST: ev('ABI_REDIS_HOST', 'localhost'),
    ABI_REDIS_PORT: Number(ev('ABI_REDIS_PORT', 6379)),

    // Core API
    CORE_API_SESSION_LIFETIME: 7, // days

    // JWTs
    JWT_SECRET: ev('JWT_SECRET'),

    // Pinata Cloud config.
    PINATA_GATEWAY_ORIGIN: ev('PINATA_GATEWAY_ORIGIN'),
    PINATA_GATEWAY_TOKEN: ev('PINATA_GATEWAY_TOKEN'),

    // Metadata config.
    METADATA_RESOLUTION_TIMEOUT: Number(ev('METADATA_RESOLUTION_TIMEOUT', 5000)),

    // Exponential backoff config for HTTP request retries.
    EXPO_BACKOFF_DELAY: 200,
    EXPO_BACKOFF_MAX_ATTEMPTS: 10,
    EXPO_BACKOFF_FACTOR: 1.5,

    // Chain Tables
    SINGLE_CHAIN_TABLE: [true, 'true'].includes(ev('SINGLE_CHAIN_TABLE', '').toLowerCase()),
    ETHEREUM_DB_URL: ev('ETHEREUM_DB_URL'),
    GOERLI_DB_URL: ev('GOERLI_DB_URL'),
    POLYGON_DB_URL: ev('POLYGON_DB_URL'),
    MUMBAI_DB_URL: ev('MUMBAI_DB_URL'),
    BASE_DB_URL: ev('BASE_DB_URL'),
    OPTIMISM_DB_URL: ev('OPTIMISM_DB_URL'),
    ARBITRUM_DB_URL: ev('ARBITRUM_DB_URL'),
    PGN_DB_URL: ev('PGN_DB_URL'),
    CELO_DB_URL: ev('CELO_DB_URL'),
    LINEA_DB_URL: ev('LINEA_DB_URL'),
}

config.INDEXER_REDIS_URL = `redis://${config.INDEXER_REDIS_HOST}:${config.INDEXER_REDIS_PORT}`
config.CORE_REDIS_URL = `redis://${config.CORE_REDIS_HOST}:${config.CORE_REDIS_PORT}`
config.ABI_REDIS_URL = `redis://${config.ABI_REDIS_HOST}:${config.ABI_REDIS_PORT}`

export default config
