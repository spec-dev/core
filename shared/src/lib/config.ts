import { ev, specEnvs } from './utils/env'

export default {
    ENV: ev('ENV', specEnvs.PROD),
    INDEXER_REDIS_URL: ev('INDEXER_REDIS_URL'),
    INDEXER_DB_HOST: ev('INDEXER_DB_HOST', 'localhost'),
    INDEXER_DB_PORT: ev('INDEXER_DB_HOST', 5432),
    INDEXER_DB_USERNAME: ev('INDEXER_DB_USERNAME', 'spec'),
    INDEXER_DB_PASSWORD: ev('INDEXER_DB_PASSWORD'),
    HEAD_REPORTER_QUEUE_KEY: ev('HEAD_REPORTER_QUEUE_KEY', 'head-reporter-queue'),
    DAG_QUEUE_KEY: ev('DAG_QUEUE_KEY', 'dag-queue'),
    DAG_KEY: ev('DAG_KEY', 'dag'),
}
