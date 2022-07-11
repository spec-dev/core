import 'reflect-metadata'
import config from '../../config'
import { DataSource } from 'typeorm'
import { IndexedBlock } from './entities/IndexedBlock'
import { createIndexedBlockTables1657506482565 } from './migrations/1657506482565-create-indexed-block-tables'

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
    migrations: [createIndexedBlockTables1657506482565],
    subscribers: [],
})
