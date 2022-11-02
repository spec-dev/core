import { ev } from './env'

const config = {
    SHARED_TABLES_DB_NAME: ev('SHARED_TABLES_DB_NAME', 'shared-tables'),
    SHARED_TABLES_DB_HOST: ev('SHARED_TABLES_DB_HOST', 'localhost'),
    SHARED_TABLES_DB_PORT: Number(ev('SHARED_TABLES_DB_PORT', 5432)),
    SHARED_TABLES_DB_USERNAME: ev('SHARED_TABLES_DB_USERNAME', 'spec'),
    SHARED_TABLES_DB_PASSWORD: ev('SHARED_TABLES_DB_PASSWORD'),
    SHARED_TABLES_MAX_POOL_SIZE: Number(ev('SHARED_TABLES_MAX_POOL_SIZE', 10)),
    CORE_DB_NAME: ev('CORE_DB_NAME', 'shared-tables'),
    CORE_DB_HOST: ev('CORE_DB_HOST', 'localhost'),
    CORE_DB_PORT: Number(ev('CORE_DB_PORT', 5432)),
    CORE_DB_USERNAME: ev('CORE_DB_USERNAME', 'spec'),
    CORE_DB_PASSWORD: ev('CORE_DB_PASSWORD'),
    CORE_MAX_POOL_SIZE: 10,
}

export default config