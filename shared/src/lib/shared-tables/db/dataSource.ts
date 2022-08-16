import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { EthBlock } from './entities/EthBlock'
import { EthTransaction } from './entities/EthTransaction'
import { EthLog } from './entities/EthLog'
import { EthTrace } from './entities/EthTrace'
import { createEthPrimitives1657679840520 } from './migrations/1657679840520-create-eth-primitives'

export const SharedTables = new DataSource({
    type: 'postgres',
    host: config.SHARED_TABLES_DB_HOST,
    port: config.SHARED_TABLES_DB_PORT,
    username: config.SHARED_TABLES_DB_USERNAME,
    password: config.SHARED_TABLES_DB_PASSWORD,
    database: 'shared-tables',
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
