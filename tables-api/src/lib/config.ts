import { ev, config, StringKeyMap } from '../../../shared'

const tablesApiConfig: StringKeyMap = {
    ...config,
    PORT: Number(ev('PORT', 4000)),
    STREAM_BATCH_SIZE: Number(ev('STREAM_BATCH_SIZE', 1000)),
    AUTH_HEADER_NAME: 'Spec-Auth-Token',
    LOAD_SCHEMA_ROLES_INTERVAL: Number(ev('LOAD_SCHEMA_ROLES_INTERVAL', 60000)),
    SHARED_TABLES_DEFAULT_ROLE: ev('SHARED_TABLES_DEFAULT_ROLE', 'bear'),
}

export default tablesApiConfig