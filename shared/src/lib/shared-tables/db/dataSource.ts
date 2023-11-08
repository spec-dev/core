import 'reflect-metadata'
import config from '../../config'
import chainIds from '../../utils/chainIds'
import { DataSource } from 'typeorm'
import { EvmBlock } from './entities/EvmBlock'
import { EvmTransaction } from './entities/EvmTransaction'
import { EvmLog } from './entities/EvmLog'

const urls = {
    [chainIds.ETHEREUM]: config.ETHEREUM_DB_URL,
    [chainIds.GOERLI]: config.GOERLI_DB_URL,
    [chainIds.POLYGON]: config.POLYGON_DB_URL,
    [chainIds.MUMBAI]: config.MUMBAI_DB_URL,
    [chainIds.BASE]: config.BASE_DB_URL,
}
const url = urls[config.CHAIN_ID] || config.SHARED_TABLES_DB_URL

const extra: any = {
    min: config.SHARED_TABLES_MIN_POOL_SIZE,
    max: config.SHARED_TABLES_MAX_POOL_SIZE,
}
if (config.SHARED_TABLES_OPTIONS) {
    extra.options = config.SHARED_TABLES_OPTIONS
}

export const SharedTables = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    logging: false,
    entities: [EvmBlock, EvmTransaction, EvmLog],
    migrations: [],
    subscribers: [],
    extra,
})
