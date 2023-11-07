import config from '../config'
import { StringKeyMap } from '../types'
import { chainSpecificSchemas, schemaForChainId } from '../utils/chainIds'
import { Pool } from 'pg'
import logger from '../logger'

const urls = {
    [chainSpecificSchemas.ETHEREUM]: config.ETHEREUM_DB_URL,
    [chainSpecificSchemas.GOERLI]: config.GOERLI_DB_URL,
    [chainSpecificSchemas.POLYGON]: config.POLYGON_DB_URL,
    [chainSpecificSchemas.MUMBAI]: config.MUMBAI_DB_URL,
    [chainSpecificSchemas.BASE]: config.BASE_DB_URL,
}

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

    async query(schema, sql: string, bindings: any[] = []): Promise<StringKeyMap[]> {
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

    async transaction(schema, logic) {
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
            const url = urls[chainSchema]
            if (!url) return
            pools[chainSchema] = url
        }
        // All chains.
        else {
            for (const schema in urls) {
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
        return new Pool({
            url,
            min: 2,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            connectionTimeoutMillis: 30000, // 30s
            statement_timeout: 150000,
        })
    }
}

const ChainTables = new ChainTablesManager()

export default ChainTables
