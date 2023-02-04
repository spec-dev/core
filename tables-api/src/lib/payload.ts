import { QueryPayload, StringKeyMap } from './types'
import { logger } from '../../../shared'

const MAX_TX_ENTRIES = 10

export function getQueryPayload(body: StringKeyMap): [QueryPayload, boolean] {
    const payload = body as QueryPayload
    return [payload, !!payload.sql]
}

export function getTxPayload(body: StringKeyMap[]): [QueryPayload[], boolean] {
    const payload = (body || []) as QueryPayload[]
    if (!payload.length) return [[], false]
    if (payload.length > MAX_TX_ENTRIES) {
        logger.info(`Tx got more than max allowed entries`, payload.length)
        return [[], false]
    }
    return [payload, payload.every(p => p?.sql && !!(p?.bindings?.length))]
}