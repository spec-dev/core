import config from '../config'
import { StringKeyMap } from '../types'
import { chainSpecificSchemas, schemaForChainId } from '../utils/chainIds'
import { Pool } from 'pg'
import logger from '../logger'
import parseDbUrl from 'parse-database-url'

const urls = {
    [chainSpecificSchemas.ETHEREUM]: config.ETHEREUM_DB_URL,
    [chainSpecificSchemas.GOERLI]: config.GOERLI_DB_URL,
    [chainSpecificSchemas.POLYGON]: config.POLYGON_DB_URL,
    [chainSpecificSchemas.MUMBAI]: config.MUMBAI_DB_URL,
    [chainSpecificSchemas.BASE]: config.BASE_DB_URL,
    [chainSpecificSchemas.OPTIMISM]: config.OPTIMISM_DB_URL,
    [chainSpecificSchemas.ARBITRUM]: config.ARBITRUM_DB_URL,
    [chainSpecificSchemas.PGN]: config.PGN_DB_URL,
    [chainSpecificSchemas.CELO]: config.CELO_DB_URL,
    [chainSpecificSchemas.LINEA]: config.LINEA_DB_URL,
}

const chainSchemasInSharedTables = new Set([
    chainSpecificSchemas.ETHEREUM,
    chainSpecificSchemas.GOERLI,
    chainSpecificSchemas.POLYGON,
    chainSpecificSchemas.MUMBAI,
])

class ChainTablesManager {
    pools: { [key: string]: Pool } = {}

    fallbackPool: Pool

    async initialize() {
        this._buildPools()
        this.fallbackPool = this._buildPool(config.SHARED_TABLES_DB_URL)
        this.fallbackPool.on('error', (err) => logger.error(`Fallback pool error`, err))
    }

    async getConnection(schema: string) {
        let conn
        try {
            conn = await (this.pools[schema] || this.fallbackPool).connect()
        } catch (err) {
            conn && conn.release()
            throw err
        }
        return conn
    }

    async query(schema: string, sql: string, bindings: any[] = []): Promise<StringKeyMap[]> {
        const conn = await this.getConnection(schema)

        let result
        try {
            result = await conn.query(sql, bindings)
        } catch (err) {
            conn.release()
            throw err
        }
        conn.release()

        if (!result) throw `Empty query result for ${sql}`
        return result.rows || []
    }

    async transaction(schema: string, logic: Function) {
        const conn = await this.getConnection(schema)

        try {
            await conn.query('BEGIN')
            await logic(conn)
            await conn.query('COMMIT')
        } catch (err) {
            await conn.query('ROLLBACK')
            conn.release()
            throw err
        }
        conn.release()
    }

    _buildPools() {
        const pools = {}

        // Single chain pool.
        if (config.SINGLE_CHAIN_TABLE) {
            const chainSchema = schemaForChainId[config.CHAIN_ID]
            if (chainSchemasInSharedTables.has(chainSchema)) return
            const url = urls[chainSchema]
            if (!url) return
            pools[chainSchema] = this._buildPool(url)
            pools[chainSchema].on('error', (err) =>
                logger.error(`PG pool error for schema ${chainSchema}`, err)
            )
        }
        // All chains.
        else {
            for (const schema in urls) {
                if (chainSchemasInSharedTables.has(schema)) continue
                const url = urls[schema]
                if (!url) continue
                pools[schema] = this._buildPool(url)
                pools[schema].on('error', (err) =>
                    logger.error(`PG pool error for schema ${schema}`, err)
                )
            }
        }

        this.pools = pools
    }

    _buildPool(url: string): Pool {
        const dbConfig = parseDbUrl(url)
        const { user, password, database, host, port } = dbConfig
        return new Pool({
            user,
            password,
            database,
            host,
            port: Number(port),
            min: config.SHARED_TABLES_MIN_POOL_SIZE,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            connectionTimeoutMillis: 30000, // 30s
            statement_timeout: 150000,
        })
    }
}

const ChainTables = new ChainTablesManager()
export default ChainTables
