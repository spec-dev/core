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
})
pool.on('error', err => logger.error('PG client error', err))

let schemaRoles = new Set<string>()

export async function loadSchemaRoles() {
    let conn
    try {
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        logger.error('Error loading schema roles', err)
    }

    let result
    try {
        result = await conn.query(
            `select rolname as name from pg_roles where rolname in (select nspname from pg_namespace)`
        )
    } catch (err) {
        logger.error(errors.QUERY_FAILED, 'loading schema roles', err)
    } finally {
        conn.release()
    }

    if (!result) {
        logger.error(errors.EMPTY_QUERY_RESULT, 'loading schema roles')
        return
    }

    const roles = (result?.rows || []).map(r => r.name)
    schemaRoles = new Set(roles)
}

function resolveRole(role?: string): string | null {
    // Role doesn't matter for read replicas.
    if (config.IS_READ_ONLY) return null

    let resolvedRole = null
    if (!!role && role !== 'null') {
        resolvedRole = schemaRoles.has(role) ? role : config.SHARED_TABLES_DEFAULT_ROLE
    }
    return resolvedRole
}

async function getPoolConnection(query: QueryPayload | QueryPayload[]) {
    let conn
    try {
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        logger.error(errors.QUERY_FAILED, JSON.stringify(query), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`
    }
    return conn
}

export async function performQuery(query: QueryPayload, role: string): Promise<StringKeyMap[]> {
    const { sql, bindings } = query
    const conn = await getPoolConnection(query)
    role = resolveRole(role)

    // Perform the query.
    let result
    try {
        await conn.query('BEGIN')
        if (role !== null) {
            logger.info('Setting role', role)
            await conn.query(`SET ROLE ${role}`)
        }
        logger.info(sql, bindings)
        result = await conn.query(sql, bindings)
        await conn.query('COMMIT')
    } catch (err) {
        await conn.query('ROLLBACK')
        logger.error(errors.QUERY_FAILED, JSON.stringify(query), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    } finally {
        conn.release()
    }

    if (!result) {
        logger.error(errors.EMPTY_QUERY_RESULT, query)
        throw `${errors.EMPTY_QUERY_RESULT}`
    }

    return result.rows || []
}

export async function performTx(queries: QueryPayload[], role: string) {
    const conn = await getPoolConnection(queries)
    role = resolveRole(role)

    let results = []
    try {
        await conn.query('BEGIN')
        if (role !== null) {
            logger.info('Setting role', role)
            await conn.query(`SET ROLE ${role}`)
        }
        results = await Promise.all(queries.map(({ sql, bindings }) => {
            logger.info(sql, bindings)
            return conn.query(sql, bindings)
        }))
        await conn.query('COMMIT')
    } catch (err) {
        await conn.query('ROLLBACK')
        logger.error(errors.QUERY_FAILED, JSON.stringify(queries), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    } finally {
        conn.release()
    }

    const responses = []
    for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (!result) {
            logger.error(errors.EMPTY_QUERY_RESULT, queries[i])
            throw `${errors.EMPTY_QUERY_RESULT}`
        }
        responses.push(result.rows || [])
    }
    
    return responses
}

export async function createQueryStream(query: QueryPayload) {
    const { sql, bindings } = query
    const conn = await getPoolConnection(query)

    // Build and return the stream.
    try {
        logger.info(sql, bindings)
        const stream = conn.query(
            new QueryStream(sql, bindings, { batchSize: config.STREAM_BATCH_SIZE })
        )
        return [stream, conn]
    } catch (err) {
        conn.release()
        logger.error(errors.STREAM_CONSTRUCTION_FAILED, query, err)
        throw `${errors.STREAM_CONSTRUCTION_FAILED}: ${err?.message || err}`
    }
}