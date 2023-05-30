import { logger, sleep, randomIntegerInRange } from '../../../shared'
import errors from './errors'
import config from './config'
import { StringKeyMap } from './types'
import { Pool } from 'pg'
import { QueryPayload } from '@spec.dev/qb'
import QueryStream from 'pg-query-stream'

const poolConfig = {
    host: config.SHARED_TABLES_DB_HOST,
    port: config.SHARED_TABLES_DB_PORT,
    user: config.IS_READ_ONLY ? config.SHARED_TABLES_READER_USERNAME : config.SHARED_TABLES_DB_USERNAME,
    password: config.IS_READ_ONLY ? config.SHARED_TABLES_READER_PASSWORD : config.SHARED_TABLES_DB_PASSWORD,
    database: config.SHARED_TABLES_DB_NAME,
    min: 2,
    max: config.SHARED_TABLES_MAX_POOL_SIZE,
    connectionTimeoutMillis: 30000, // 30s
    statement_timeout: config.IS_READ_ONLY ? 300000 : 120000,
}
const primaryPool = new Pool(poolConfig)
primaryPool.on('error', err => logger.error('Primary: PG client error', err))

const readerPool = config.IS_READ_ONLY ? new Pool({
    ...poolConfig,
    host: config.SHARED_TABLES_READER_HOST,
}) : null
readerPool?.on('error', err => logger.error('Reader: PG client error', err))

let schemaRoles = new Set<string>()
export async function loadSchemaRoles() {
    let conn
    try {
        conn = await primaryPool.connect()
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

function resolveRole(role?: string): string {
    return schemaRoles.has(role) ? role : config.SHARED_TABLES_DEFAULT_ROLE
}

async function getPoolConnection(
    query: QueryPayload | QueryPayload[],
    usePrimaryDb: boolean,
) {
    let conn
    try {
        console.log('usePrimaryDb', usePrimaryDb, primaryPool, readerPool)
        const pool = (usePrimaryDb ? primaryPool : readerPool) || primaryPool
        conn = await pool.connect()
    } catch (err) {
        conn && conn.release()
        logger.error(errors.QUERY_FAILED, JSON.stringify(query), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`
    }
    return conn
}

export async function performQuery(
    query: QueryPayload, 
    role: string,
    attempt: number = 1,
): Promise<StringKeyMap[]> {
    const { sql, bindings } = query
    const conn = await getPoolConnection(query, true)
    role = resolveRole(role)

    // Perform the query.
    let result
    try {
        await conn.query('BEGIN')
        logger.info('Setting role', role)
        await conn.query(`SET LOCAL ROLE ${role}`)
        logger.info(sql, bindings)
        result = await conn.query(sql, bindings)
        await conn.query('COMMIT')
    } catch (err) {
        await conn.query('ROLLBACK')
        conn.release()

        // Wait and try again if deadlocked.
        const message = err.message || err.toString() || ''
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            logger.error(`Got deadlock, trying again... (${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`)
            await sleep(randomIntegerInRange(50, 500))
            return await performQuery(query, role, attempt + 1)
        }

        logger.error(errors.QUERY_FAILED, JSON.stringify(query), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    }
    conn.release()

    if (!result) {
        logger.error(errors.EMPTY_QUERY_RESULT, query)
        throw `${errors.EMPTY_QUERY_RESULT}`
    }

    return result.rows || []
}

export async function performTx(
    queries: QueryPayload[], 
    role: string,
    attempt: number = 1,
): Promise<StringKeyMap[][]> {
    const conn = await getPoolConnection(queries, true)
    role = resolveRole(role)

    let results = []
    try {
        await conn.query('BEGIN')
        logger.info('Setting role', role)
        await conn.query(`SET LOCAL ROLE ${role}`)
        results = await Promise.all(queries.map(({ sql, bindings }) => {
            logger.info(sql, bindings)
            return conn.query(sql, bindings)
        }))
        await conn.query('COMMIT')
    } catch (err) {
        await conn.query('ROLLBACK')
        conn.release()

        // Wait and try again if deadlocked.
        const message = err.message || err.toString() || ''
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            logger.error(`Got deadlock, trying again... (${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`)
            await sleep(randomIntegerInRange(50, 500))
            return await performTx(queries, role, attempt + 1)
        }

        logger.error(errors.QUERY_FAILED, JSON.stringify(queries), err)
        throw `${errors.QUERY_FAILED}: ${err?.message || err}`    
    }
    conn.release()
    
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

export async function createQueryStream(query: QueryPayload, usePrimaryDb: boolean) {
    const { sql, bindings } = query
    const conn = await getPoolConnection(query, usePrimaryDb)

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