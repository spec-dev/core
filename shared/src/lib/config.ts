import { ev, specEnvs } from './utils/env'
import { StringKeyMap } from './types'

const config: StringKeyMap = {
    ENV: ev('ENV', specEnvs.PROD),

    // Logging.
    BUGSNAG_API_KEY: ev('BUGSNAG_API_KEY'),

    // Indexer Redis Instance
    INDEXER_REDIS_HOST: ev('INDEXER_REDIS_HOST', 'localhost'),
    INDEXER_REDIS_PORT: Number(ev('INDEXER_REDIS_PORT', 6379)),

    // Indexer Postgres Instance
    INDEXER_DB_NAME: ev('INDEXER_DB_NAME', 'indexer'),
    INDEXER_DB_HOST: ev('INDEXER_DB_HOST', 'localhost'),
    INDEXER_DB_PORT: Number(ev('INDEXER_DB_PORT', 5432)),
    INDEXER_DB_USERNAME: ev('INDEXER_DB_USERNAME', 'spec'),
    INDEXER_DB_PASSWORD: ev('INDEXER_DB_PASSWORD'),
    INDEXER_DB_MAX_POOL_SIZE: Number(ev('INDEXER_DB_MAX_POOL_SIZE', 10)),

    // Head Reporter redis queue & job name
    HEAD_REPORTER_QUEUE_KEY: ev('HEAD_REPORTER_QUEUE_KEY', 'head-reporter-queue'),
    INDEX_BLOCK_JOB_NAME: ev('INDEX_BLOCK_JOB_NAME', 'index-block'),

    // Delayed job redis queue
    DELAYED_JOB_QUEUE_KEY: ev('DELAYED_JOB_QUEUE_KEY', 'delayed-jobs'),

    BLOCK_EVENTS_PREFIX: ev('BLOCK_EVENTS_PREFIX', 'block-events'),
    BLOCK_CALLS_PREFIX: ev('BLOCK_CALLS_PREFIX', 'block-calls'),
    BLOCK_EVENTS_QUEUE_PREFIX: ev('BLOCK_EVENTS_QUEUE_KEY', 'block-events-queue'),
    SORT_BLOCK_EVENTS_JOB_NAME: ev('SORT_BLOCK_EVENTS_JOB_NAME', 'sort-block-events'),

    EVENT_GENERATOR_QUEUE_PREFIX: ev('EVENT_GENERATOR_QUEUE_PREFIX', 'event-gen-queue'),
    EVENT_GENERATOR_JOB_NAME: ev('EVENT_GENERATOR_JOB_NAME', 'event-gen'),

    // Public Tables Postgres Instance
    SHARED_TABLES_DB_NAME: ev('SHARED_TABLES_DB_NAME', 'shared-tables'),
    SHARED_TABLES_DB_HOST: ev('SHARED_TABLES_DB_HOST', 'localhost'),
    SHARED_TABLES_DB_PORT: Number(ev('SHARED_TABLES_DB_PORT', 5432)),
    SHARED_TABLES_DB_USERNAME: ev('SHARED_TABLES_DB_USERNAME', 'spec'),
    SHARED_TABLES_DB_PASSWORD: ev('SHARED_TABLES_DB_PASSWORD'),
    SHARED_TABLES_MAX_POOL_SIZE: Number(ev('SHARED_TABLES_MAX_POOL_SIZE', 10)),

    // DAG Queue
    DAG_QUEUE_KEY: ev('DAG_QUEUE_KEY', 'dag-queue'),
    DAG_KEY: ev('DAG_KEY', 'dag'),

    // Core Postgres Instance
    CORE_DB_NAME: ev('CORE_DB_NAME', 'core'),
    CORE_DB_HOST: ev('CORE_DB_HOST', 'localhost'),
    CORE_DB_PORT: Number(ev('CORE_DB_PORT', 5432)),
    CORE_DB_USERNAME: ev('CORE_DB_USERNAME', 'spec'),
    CORE_DB_PASSWORD: ev('CORE_DB_PASSWORD'),
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
}

config.INDEXER_REDIS_URL = `redis://${config.INDEXER_REDIS_HOST}:${config.INDEXER_REDIS_PORT}`
config.CORE_REDIS_URL = `redis://${config.CORE_REDIS_HOST}:${config.CORE_REDIS_PORT}`
config.ABI_REDIS_URL = `redis://${config.ABI_REDIS_HOST}:${config.ABI_REDIS_PORT}`

export default config
