import { ev, specEnvs } from './utils/env'

export default {
    ENV: ev('ENV', specEnvs.PROD),

    // Indexer Redis Instance
    INDEXER_REDIS_URL: ev('INDEXER_REDIS_URL', 'redis://localhost:6379'),
    INDEXER_REDIS_HOST: ev('INDEXER_REDIS_HOST', 'localhost'),
    INDEXER_REDIS_PORT: ev('INDEXER_REDIS_PORT', 6379),

    // Indexer Postgres Instance
    INDEXER_DB_HOST: ev('INDEXER_DB_HOST', 'localhost'),
    INDEXER_DB_PORT: ev('INDEXER_DB_PORT', 5432),
    INDEXER_DB_USERNAME: ev('INDEXER_DB_USERNAME', 'spec'),
    INDEXER_DB_PASSWORD: ev('INDEXER_DB_PASSWORD'),

    // Head Reporter redis queue & job name
    HEAD_REPORTER_QUEUE_KEY: ev('HEAD_REPORTER_QUEUE_KEY', 'head-reporter-queue'),
    INDEX_BLOCK_JOB_NAME: ev('INDEX_BLOCK_JOB_NAME', 'index-block'),

    // Public Tables Postgres Instance
    PUBLIC_TABLES_DB_HOST: ev('PUBLIC_TABLES_DB_HOST', 'localhost'),
    PUBLIC_TABLES_DB_PORT: ev('PUBLIC_TABLES_DB_PORT', 5432),
    PUBLIC_TABLES_DB_USERNAME: ev('PUBLIC_TABLES_DB_USERNAME', 'spec'),
    PUBLIC_TABLES_DB_PASSWORD: ev('PUBLIC_TABLES_DB_PASSWORD'),

    // DAG Queue
    DAG_QUEUE_KEY: ev('DAG_QUEUE_KEY', 'dag-queue'),
    DAG_KEY: ev('DAG_KEY', 'dag'),

    // Core Postgres Instance
    CORE_DB_HOST: ev('CORE_DB_HOST', 'localhost'),
    CORE_DB_PORT: ev('CORE_DB_PORT', 5432),
    CORE_DB_USERNAME: ev('CORE_DB_USERNAME', 'spec'),
    CORE_DB_PASSWORD: ev('CORE_DB_PASSWORD'),

    // Indexer Redis Instance
    CORE_REDIS_URL: ev('CORE_REDIS_URL', 'redis://localhost:6379'),
    CORE_REDIS_HOST: ev('CORE_REDIS_HOST', 'localhost'),
    CORE_REDIS_PORT: ev('CORE_REDIS_PORT', 6379),
}
