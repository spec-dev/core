import 'reflect-metadata'
import config from '../../config'
import chainIds from '../../utils/chainIds'
import { DataSource } from 'typeorm'
import { EvmBlock } from './entities/EvmBlock'
import { EvmTransaction } from './entities/EvmTransaction'
import { EvmLog } from './entities/EvmLog'
import { EvmReceipt } from './entities/EvmReceipt'

const urls = {
    [chainIds.ETHEREUM]: config.ETHEREUM_DB_URL,
    [chainIds.GOERLI]: config.GOERLI_DB_URL,
    [chainIds.POLYGON]: config.POLYGON_DB_URL,
    [chainIds.MUMBAI]: config.MUMBAI_DB_URL,
    [chainIds.BASE]: config.BASE_DB_URL,
    [chainIds.OPTIMISM]: config.OPTIMISM_DB_URL,
    [chainIds.ARBITRUM]: config.ARBITRUM_DB_URL,
    [chainIds.PGN]: config.PGN_DB_URL,
    [chainIds.CELO]: config.CELO_DB_URL,
    [chainIds.LINEA]: config.LINEA_DB_URL,
}
const url = urls[config.CHAIN_ID] || config.SHARED_TABLES_DB_URL

const extra: any = {
    min: config.SHARED_TABLES_MIN_POOL_SIZE,
    max: config.SHARED_TABLES_MAX_POOL_SIZE,
}
if (config.SHARED_TABLES_OPTIONS) {
    extra.options = config.SHARED_TABLES_OPTIONS
}

const entities: any = [EvmBlock, EvmTransaction, EvmLog]
if ([chainIds.OPTIMISM, chainIds.ARBITRUM].includes(config.CHAIN_ID)) {
    entities.push(EvmReceipt)
}

export const SharedTables = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    logging: false,
    entities,
    migrations: [],
    subscribers: [],
    extra,
})
