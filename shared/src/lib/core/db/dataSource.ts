import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'

export const CoreDB = new DataSource({
    type: 'postgres',
    host: config.CORE_DB_HOST,
    port: config.CORE_DB_PORT,
    username: config.CORE_DB_USERNAME,
    password: config.CORE_DB_PASSWORD,
    database: 'core',
    synchronize: false,
    logging: false,
    entities: [__dirname + '/entities/*.ts'],
    migrations: [__dirname + '/migrations/*.ts'],
    subscribers: [],
    extra: {
        min: 2,
        max: config.CORE_DB_MAX_POOL_SIZE,
    },
})
