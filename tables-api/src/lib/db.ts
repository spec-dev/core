import { logger, sleep, randomIntegerInRange, ChainTables } from '../../../shared'
import errors from './errors'
import config from './config'
import { StringKeyMap } from './types'
import { QueryPayload } from '@spec.dev/qb'
import QueryStream from 'pg-query-stream'
import { ident } from 'pg-format'

const schemaRoles = new Set(config.ROLES)

function resolveRole(role?: string): string {
    return schemaRoles.has(role) ? role : config.SHARED_TABLES_DEFAULT_ROLE
}

async function getPoolConnection(
    query: QueryPayload | QueryPayload[],
    schema: string,
) {
    let conn
    try {
        conn = await ChainTables.getConnection(schema)
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
    const { sql, bindings, schemaName } = query
    const conn = await getPoolConnection(query, schemaName)
    role = resolveRole(role)

    // Perform the query.
    let result
    try {
        await conn.query('BEGIN')

        logger.info('Setting role', role)
        await conn.query(`SET LOCAL ROLE ${ident(role)}`)

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
    schema: string,
    role: string,
    attempt: number = 1,
): Promise<StringKeyMap[][]> {
    const conn = await getPoolConnection(queries, schema)
    role = resolveRole(role)

    let results = []
    try {
        await conn.query('BEGIN')
        logger.info('Setting role', role)
        await conn.query(`SET LOCAL ROLE ${ident(role)}`)
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
            return await performTx(queries, schema, role, attempt + 1)
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

export async function createQueryStream(query: QueryPayload, schema: string) {
    const { sql, bindings } = query
    const conn = await getPoolConnection(query, schema)

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