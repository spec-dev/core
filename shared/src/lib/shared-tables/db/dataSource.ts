import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { EthBlock } from './entities/EthBlock'
import { EthTransaction } from './entities/EthTransaction'
import { EthLog } from './entities/EthLog'
import { EthTrace } from './entities/EthTrace'
import { EthContract } from './entities/EthContract'
import { createEthPrimitives1660682124617 } from './migrations/1660682124617-create-eth-primitives'
import { createBlockNumberIndexes1660685897561 } from './migrations/1660685897561-create-block-number-indexes'

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
        EthContract,
    ],
    migrations: [createEthPrimitives1660682124617, createBlockNumberIndexes1660685897561],
    subscribers: [],
})
