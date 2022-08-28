import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'

export const IndexerDB = new DataSource({
    type: 'postgres',
    host: config.INDEXER_DB_HOST,
    port: config.INDEXER_DB_PORT,
    username: config.INDEXER_DB_USERNAME,
    password: config.INDEXER_DB_PASSWORD,
    database: 'indexer',
    synchronize: false,
    logging: false,
    entities: [__dirname + '/entities/*.ts'],
    migrations: [__dirname + '/migrations/*.ts'],
    subscribers: [],
    extra: {
        min: 2,
        max: config.INDEXER_DB_MAX_POOL_SIZE,
    },
})
