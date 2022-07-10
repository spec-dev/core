import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { IndexedBlock } from './entities/IndexedBlock'
import { createIndexedBlocksTable1657418789096 } from './migrations/1657418789096-create-indexed-blocks-table'

export const IndexerDB = new DataSource({
    type: 'postgres',
    host: config.INDEXER_DB_HOST,
    port: config.INDEXER_DB_PORT,
    username: config.INDEXER_DB_USERNAME,
    password: config.INDEXER_DB_PASSWORD,
    database: 'indexer',
    synchronize: false,
    logging: false,
    entities: [IndexedBlock],
    migrations: [
        createIndexedBlocksTable1657418789096,
    ],
    subscribers: [],
})
