import { ev, config, StringKeyMap } from '../../../shared'

const tablesApiConfig: StringKeyMap = {
    ...config,
    PORT: Number(ev('PORT', 4000)),
    STREAM_BATCH_SIZE: Number(ev('STREAM_BATCH_SIZE', 1000)),
    AUTH_HEADER_NAME: 'Spec-Auth-Token',
    LOAD_SCHEMA_ROLES_INTERVAL: Number(ev('LOAD_SCHEMA_ROLES_INTERVAL', 60000)),
    UPDATE_PIPELINE_CACHE_INTERVAL: Number(ev('UPDATE_PIPELINE_CACHE_INTERVAL', 100)),
    SHARED_TABLES_DEFAULT_ROLE: ev('SHARED_TABLES_DEFAULT_ROLE', 'bear'),
    SHARED_TABLES_READER_HOST: ev('SHARED_TABLES_READER_HOST'),
    SHARED_TABLES_READER_USERNAME: ev('SHARED_TABLES_READER_USERNAME', 'bear'),
    SHARED_TABLES_READER_PASSWORD: ev('SHARED_TABLES_READER_PASSWORD'),
    IS_READ_ONLY: [true, 'true'].includes(ev('IS_READ_ONLY')),
}

export default tablesApiConfig