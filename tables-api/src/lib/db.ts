import { logger } from '../../../shared'
import errors from './errors'
import config from './config'
import { QueryPayload, StringKeyMap } from './types'
import { Pool } from 'pg'
import QueryStream from 'pg-query-stream'

// Create connection pool.
export const pool = new Pool({
    host : config.SHARED_TABLES_DB_HOST,
    port : config.SHARED_TABLES_DB_PORT,
    user : config.SHARED_TABLES_DB_USERNAME,
    password : config.SHARED_TABLES_DB_PASSWORD,
    database : config.SHARED_TABLES_DB_NAME,
    min: 2,
    max: config.SHARED_TABLES_MAX_POOL_SIZE,
    idleTimeoutMillis: 0,
    query_timeout: 0,
    connectionTimeoutMillis: 0,
    statement_timeout: 0,
    idle_in_transaction_session_timeout: 0,
})
pool.on('error', err => logger.error('PG client error', err))

export async function performQuery(query: QueryPayload): Promise<StringKeyMap[]> {
    const { sql, bindings } = query

    // Get a connection from the pool.
    let conn
    try {
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        logger.error(errors.QUERY_FAILED, query, err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    }

    // Perform the query.
    let result, error
    try {
        result = await conn.query(sql, bindings)
    } catch (err) {
        error = err
    } finally {
        conn.release()
    }
    if (error) {
        logger.error(errors.QUERY_FAILED, query, error)
        throw `${errors.QUERY_FAILED}: ${error?.message || error}`    
    }
    if (!result) {
        logger.error(errors.EMPTY_QUERY_RESULT, query)
        throw `${errors.EMPTY_QUERY_RESULT}`
    }
    return result.rows || []
}

export async function createQueryStream(query: QueryPayload) {
    const { sql, bindings } = query

    // Get a client from the pool.
    let conn
    try {
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        logger.error(errors.QUERY_FAILED, query, err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    }

    // Build and return the stream.
    try {
        logger.info(sql, bindings)
        const stream = conn.query(
            new QueryStream(sql, bindings, { batchSize: config.STREAM_BATCH_SIZE })
        )
        stream.on('end', () => {
            logger.error(`Query stream ended.`)
            conn.release()
        })
        stream.on('error', error => {
            logger.error(`Query stream error: ${error}`)
            conn.release()
        })
        return stream
    } catch (err) {
        conn.release()
        logger.error(errors.STREAM_CONSTRUCTION_FAILED, query, err)
        throw `${errors.STREAM_CONSTRUCTION_FAILED}: ${err?.message || err}`
    }
}

//asdfasdf