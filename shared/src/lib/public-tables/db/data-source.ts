import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { EthBlock } from './entities/EthBlock'

export const IndexerDB = new DataSource({
    type: 'postgres',
    host: config.PUBLIC_TABLES_DB_HOST,
    port: config.PUBLIC_TABLES_DB_PORT,
    username: config.PUBLIC_TABLES_DB_USERNAME,
    password: config.PUBLIC_TABLES_DB_PASSWORD,
    database: 'public-tables',
    synchronize: false,
    logging: false,
    entities: [
        // Ethereum schema.
        EthBlock,
    ],
    migrations: [],
    subscribers: [],
})
