import { createClient, createCluster, commandOptions } from 'redis'
import config from '../config'
import logger from '../logger'
import { StringKeyMap } from '../types'
import { range } from '../utils/math'
import { specEnvs } from '../utils/env'

// Create redis client.
const url = config.CORE_REDIS_URL
const configureRedis = config.ENV === specEnvs.LOCAL || config.CORE_REDIS_HOST !== 'localhost'
const useCluster = !url?.includes('localhost') && !url?.includes('dev')

export const redis = configureRedis
    ? useCluster
        ? createCluster({
              rootNodes: range(1, config.CORE_REDIS_NODE_COUNT).map((n) => ({
                  url: url.replace('NODE', n),
              })),
          })
        : createClient({ url })
    : null

// Log any redis client errors.
redis?.on('error', (err) => logger.error(`Redis error: ${err}`))

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
        await redis?.hSet(keys.EDGE_FUNCTION_URLS, [key, url])
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
        urls = (await redis?.hmGet(keys.EDGE_FUNCTION_URLS, key)) || []
    } catch (err) {
        logger.error(`Error getting edge function url from redis (key=${key}): ${err}.`)
    }

    return urls[0] || null
}

export async function addLog(projectUid: string, data: StringKeyMap) {
    try {
        await redis?.xAdd(projectUid, '*', data, {
            TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 1000 },
        })
    } catch (err) {
        logger.error(`Error adding log for project.uid=${projectUid}: ${data}: ${err}.`)
    }
}

export async function getLastXLogs(projectUid: string, x: number) {
    let results = []
    try {
        results = (await redis?.xRevRange(projectUid, '+', '-', { COUNT: x })) || []
    } catch (err) {
        logger.error(`Error getting last ${x} logs for project.uid=${projectUid}: ${err}.`)
        return []
    }
    return results.reverse()
}

export async function tailLogs(projectUid: string, id: string = '$') {
    try {
        const resp = await redis?.xRead(
            commandOptions({ isolated: true }),
            {
                key: projectUid,
                id,
            },
            { COUNT: 1, BLOCK: 0 }
        )
        if (!resp?.length) return []
        return resp[0].messages || []
    } catch (err) {
        logger.error(`Error tailing logs for project.uid=${projectUid}: ${err}.`)
    }
}
