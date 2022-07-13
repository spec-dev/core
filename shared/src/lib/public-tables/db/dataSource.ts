import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { EthBlock } from './entities/EthBlock'
import { EthTransaction } from './entities/EthTransaction'
import { EthLog } from './entities/EthLog'
import { EthTrace } from './entities/EthTrace'
import { createEthPrimitives1657679840520 } from './migrations/1657679840520-create-eth-primitives'

export const PublicTables = new DataSource({
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
        EthTransaction,
        EthLog,
        EthTrace,
    ],
    migrations: [createEthPrimitives1657679840520],
    subscribers: [],
})
