import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'

const extra: any = {
    min: 2,
    max: config.SHARED_TABLES_MAX_POOL_SIZE,
}
if (config.SHARED_TABLES_OPTIONS) {
    extra.options = config.SHARED_TABLES_OPTIONS
}

export const SharedTables = new DataSource({
    type: 'postgres',
    host: config.SHARED_TABLES_DB_HOST,
    port: config.SHARED_TABLES_DB_PORT,
    username: config.SHARED_TABLES_DB_USERNAME,
    password: config.SHARED_TABLES_DB_PASSWORD,
    database: config.SHARED_TABLES_DB_NAME,
    synchronize: false,
    logging: false,
    entities: [__dirname + '/entities/*.{js,ts}'],
    migrations: [__dirname + '/migrations/*.{js,ts}'],
    subscribers: [],
    extra,
})
