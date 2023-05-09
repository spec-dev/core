import { StringKeyMap } from './types'
import { logger } from '../../../shared'
import config from './config'
import { buildSelectQuery, buildUpsertQuery, QueryPayload } from '@spec.dev/qb'

const MAX_TX_ENTRIES = 10

export function getQueryPayload(payload: StringKeyMap, claims: StringKeyMap): [StringKeyMap, boolean] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return [payload, false]
    }

    // Check if allowed to pass raw 'sql' param.
    const hasSql = payload.hasOwnProperty('sql')
    const canUseSql = (claims.id && config.V0_PAYLOAD_WHITELIST.includes(claims.id)) || claims.role === 'lens'
    if (hasSql) {
        const sql = (payload.sql || '').toLowerCase()
        if (!sql.startsWith('select ') && !sql.startsWith('insert ')) {
            return [payload, false]
        }
        return [payload, canUseSql]
    }

    try {
        const query = buildQueryFromPayload(payload)
        return query ? [query, true] : [payload, false]
    } catch (err) {
        return [payload, false]
    } 
}

export function getTxPayload(payload: StringKeyMap[], claims: StringKeyMap): [StringKeyMap[], boolean] {
    if (!payload) return [payload, false]
    payload = payload || []
    payload = Array.isArray(payload) ? payload : [payload]
    if (!payload.length) {
        return [payload, false]
    }
    // if (payload.length > MAX_TX_ENTRIES) {
    //     logger.info(`Tx got more than max allowed entries`, payload.length)
    //     return [payload, false]
    // }

    const queries = []
    for (const entry of payload) {
        const [query, isValid] = getQueryPayload(entry, claims)
        if (!isValid) return [payload, false]
        queries.push(query)
    }
    return [queries, true]
}

function buildQueryFromPayload(payload: StringKeyMap): QueryPayload | null {
    payload = payload || {}
    const table = payload.table
    if (!table) return null

    // SELECT
    if (payload.hasOwnProperty('filters')) {
        return buildSelectQuery(table, payload.filters, payload.options)
    }

    // UPSERT
    if (payload.data && payload.hasOwnProperty('conflictColumns') && payload.hasOwnProperty('updateColumns')) {
        return buildUpsertQuery(
            table,
            payload.data,
            payload.conflictColumns || [],
            payload.updateColumns || [],
            payload.returning,
        )
    }

    return null
}

/**
 * Ensure no writes can happen that involve...
 * a) tables that are failing, or
 * b) records with block numbers greater than the hard ceiling for the chain.
 */
export function isTableOpRestricted(
    payload: StringKeyMap | StringKeyMap[],
    query: StringKeyMap | StringKeyMap[],
    pipelineCache: StringKeyMap,
): boolean {
    const payloads: StringKeyMap[] = Array.isArray(payload) ? payload : [payload]
    const queries: StringKeyMap[] = Array.isArray(query) ? query : [query]
    const isWriteOp = !!queries.find(q => {
        const sql = q?.sql?.toLowerCase() || ''
        if (!sql) return false
        return sql.startsWith('insert ') || sql.startsWith('update ' ) || sql.startsWith('delete ' )
    }) 
    if (!isWriteOp) return false

    const tables = new Set(payloads.map(p => p.table).filter(table => !!table))
    const entries = payloads.map(p => p.data).flat().filter(data => !!data)
    const entry = entries[0] || {}
    const chainId = entry.chainId || entry.chain_id
    if (!chainId) return false

    const pipelineCacheEntry = pipelineCache[chainId]
    if (!pipelineCacheEntry) return false

    let blockNumber = parseInt(entry.blockNumber || entry.block_number)
    blockNumber = Number.isNaN(blockNumber) ? null : blockNumber

    const currentBlockOpsCeiling = pipelineCacheEntry.blockOpsCeiling || null
    if (currentBlockOpsCeiling && blockNumber && blockNumber >= currentBlockOpsCeiling) {
        logger.warn(
            `Chain currently has inclusive ceilng of ${currentBlockOpsCeiling}. Blocking operation on number ${blockNumber}`,
            queries,
        )
        return true
    }

    for (const table of tables) {
        if (pipelineCacheEntry.failingTables.has(table)) {
            logger.warn(`Table "${table}" is currently marked as failing. Won't perform operation.`)
            return true
        }
    }

    return false
}