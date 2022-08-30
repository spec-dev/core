import { ev, specEnvs } from './utils/env'
import { StringKeyMap } from './types'

const config: StringKeyMap = {
    ENV: ev('ENV', specEnvs.PROD),

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

    // JWTs
    JWT_SECRET: ev('JWT_SECRET'),
}

config.INDEXER_REDIS_URL = `redis://${config.INDEXER_REDIS_HOST}:${config.INDEXER_REDIS_PORT}`
config.CORE_REDIS_URL = `redis://${config.CORE_REDIS_HOST}:${config.CORE_REDIS_PORT}`

export default config
