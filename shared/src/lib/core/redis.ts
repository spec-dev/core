import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'
import { StringKeyMap } from '../types'

// Create redis client.
export const redis = createClient({ url: config.CORE_REDIS_URL })

// Log any redis client errors.
redis.on('error', (err) => logger.error(`Redis error: ${err}`))

const keys = {
    EDGE_FUNCTION_URLS: 'edge-function-urls',
}

export const formatEdgeFunctionVersionStr = (nsp: string, name: string, version?: string | null) =>
    `${nsp}.${name}@${version || 'latest'}`

export async function setEdgeFunctionUrl(
    url: string,
    nsp: string,
    name: string,
    version?: string | null
) {
    const key = formatEdgeFunctionVersionStr(nsp, name, version)
    try {
        await redis.hSet(keys.EDGE_FUNCTION_URLS, [key, url])
    } catch (err) {
        logger.error(`Error setting edge function url to redis (key=${key}, value=${url}): ${err}.`)
        return false
    }
    return true
}

export async function getEdgeFunctionUrl(
    nsp: string,
    name: string,
    version?: string | null
): Promise<string | null> {
    const key = formatEdgeFunctionVersionStr(nsp, name, version)
    let urls = []
    try {
        urls = (await redis.hmGet(keys.EDGE_FUNCTION_URLS, key)) || []
    } catch (err) {
        logger.error(`Error getting edge function url from redis (key=${key}): ${err}.`)
    }

    return urls[0] || null
}

export async function addLog(projectId: string, data: StringKeyMap) {
    try {
        await redis.xAdd(projectId, '*', data)
    } catch (err) {
        logger.error(`Error adding log for projectId=${projectId}: ${data}: ${err}.`)
    }
}

export async function getLastXLogs(projectId: string, x: number) {
    let results = []
    try {
        results = await redis.xRevRange(projectId, '-', '+', { COUNT: x })
    } catch (err) {
        logger.error(`Error getting last ${x} logs for projectId=${projectId}: ${err}.`)
        return []
    }
    return results.reverse()
}