import { ev, specEnvs } from './utils/env'

export default {
    ENV: ev('ENV', specEnvs.PROD),
    INDEXER_REDIS_URL: ev('INDEXER_REDIS_URL', 'redis://localhost:6379'),
    INDEXER_REDIS_HOST: ev('INDEXER_REDIS_HOST', 'localhost'),
    INDEXER_REDIS_PORT: ev('INDEXER_REDIS_PORT', 6379),
    INDEXER_DB_HOST: ev('INDEXER_DB_HOST', 'localhost'),
    INDEXER_DB_PORT: ev('INDEXER_DB_PORT', 5432),
    INDEXER_DB_USERNAME: ev('INDEXER_DB_USERNAME', 'spec'),
    INDEXER_DB_PASSWORD: ev('INDEXER_DB_PASSWORD'),
    HEAD_REPORTER_QUEUE_KEY: ev('HEAD_REPORTER_QUEUE_KEY', 'head-reporter-queue'),
    INDEX_BLOCK_JOB_NAME: ev('INDEX_BLOCK_JOB_NAME', 'index-block'),
    DAG_QUEUE_KEY: ev('DAG_QUEUE_KEY', 'dag-queue'),
    DAG_KEY: ev('DAG_KEY', 'dag'),
}
