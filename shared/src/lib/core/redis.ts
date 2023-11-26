import { createClient, createCluster, commandOptions } from 'redis'
import config from '../config'
import logger from '../logger'
import { StringKeyMap } from '../types'
import { range } from '../utils/math'
import { sleep } from '../utils/time'
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

// Log any redis client errors and attempt reconnections.
let reconnectAttempt = 0
redis?.on('error', async (err) => {
    console.error(err)
    logger.error(`Core Redis error: ${err}`)

    if (reconnectAttempt >= 3) return
    reconnectAttempt++
    logger.error(`Core Redis - attempting reconnect ${reconnectAttempt}`)

    try {
        await redis?.disconnect()
        await sleep(1000)
        await redis?.connect()
    } catch (err) {
        console.error(err)
        logger.error(`Core Redis -- reconnect error: ${err}`)
    }
})

const keys = {
    LATEST_TOKEN_PRICES: 'latest-token-prices',
    TEST_STREAM_INPUT_GEN: 'test-stream-input-gen',
    FEATURED_NAMESPACES: 'featured-namespaces',
    RECORD_COUNTS: 'record-counts',
    NAMESPACE_RECORD_COUNTS: 'namespace-record-counts',
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
            { COUNT: 1, BLOCK: 1000 }
        )
        if (!resp?.length) return []
        return resp[0].messages || []
    } catch (err) {
        logger.error(`Error tailing logs for project.uid=${projectUid}: ${err}.`)
    }
}

export async function getLatestTokenPrices(
    tokenKeys?: string[] // ['<chainId>:<address>', ...]
): Promise<StringKeyMap> {
    try {
        if (tokenKeys?.length) {
            const results = await redis?.hmGet(keys.LATEST_TOKEN_PRICES, tokenKeys)
            const prices = {}
            for (let i = 0; i < tokenKeys.length; i++) {
                const key = tokenKeys[i]
                const result = results[i]
                if (!result) continue
                prices[key] = JSON.parse(result)
            }
            return prices
        }

        const results = await redis?.hGetAll(keys.LATEST_TOKEN_PRICES)
        const prices = {}
        for (const key in results) {
            const result = results[key]
            if (!result) continue
            prices[key] = JSON.parse(result)
        }
        return prices
    } catch (err) {
        logger.error(`Error getting latest token prices from redis: ${JSON.stringify(err)}.`)
        return {}
    }
}

export async function setLatestTokenPrices(map: StringKeyMap): Promise<boolean> {
    try {
        await redis?.hSet(keys.LATEST_TOKEN_PRICES, map)
        return true
    } catch (err) {
        logger.error(`Error setting latest token prices in redis: ${JSON.stringify(err)}.`)
        return false
    }
}

export async function updateRecordCountsCache(map: StringKeyMap): Promise<boolean> {
    try {
        await redis?.hSet(keys.RECORD_COUNTS, map)
        return true
    } catch (err) {
        logger.error(`Error updating record counts cache: ${JSON.stringify(err)}.`)
        return false
    }
}

export async function getCachedRecordCounts(tablePaths?: string[]): Promise<StringKeyMap> {
    try {
        if (tablePaths?.length) {
            const results = await redis?.hmGet(keys.RECORD_COUNTS, tablePaths)
            const data = {}
            for (let i = 0; i < tablePaths.length; i++) {
                const tablePath = tablePaths[i]
                const result = results[i]
                if (!result) continue
                data[tablePath] = JSON.parse(result)
            }
            return data
        }

        const results = await redis?.hGetAll(keys.RECORD_COUNTS)
        const data = {}
        for (const key in results) {
            const result = results[key]
            if (!result) continue
            data[key] = JSON.parse(result)
        }
        return data
    } catch (err) {
        logger.error(
            `Error getting cached record counts for table paths ${tablePaths?.join(
                ', '
            )}: ${JSON.stringify(err)}.`
        )
        return {}
    }
}

export async function updateNamespaceRecordCountsCache(map: StringKeyMap): Promise<boolean> {
    try {
        await redis?.hSet(keys.NAMESPACE_RECORD_COUNTS, map)
        return true
    } catch (err) {
        logger.error(`Error updating namespace record counts cache: ${JSON.stringify(err)}.`)
        return false
    }
}

export async function getCachedNamespaceRecordCounts(nsps?: string[]): Promise<StringKeyMap> {
    try {
        if (nsps?.length) {
            const results = await redis?.hmGet(keys.NAMESPACE_RECORD_COUNTS, nsps)
            const data = {}
            for (let i = 0; i < nsps.length; i++) {
                const nsp = nsps[i]
                const result = results[i]
                if (!result) continue
                data[nsp] = JSON.parse(result)
            }
            return data
        }

        const results = await redis?.hGetAll(keys.NAMESPACE_RECORD_COUNTS)
        const data = {}
        for (const key in results) {
            const result = results[key]
            if (!result) continue
            data[key] = JSON.parse(result)
        }
        return data
    } catch (err) {
        logger.error(
            `Error getting cached namespace record counts for namespaces ${nsps?.join(
                ', '
            )}: ${JSON.stringify(err)}.`
        )
        return {}
    }
}

export async function setCachedInputGenForStreamId(
    streamId: string,
    inputGen: StringKeyMap
): Promise<boolean> {
    try {
        await redis?.hSet(keys.TEST_STREAM_INPUT_GEN, [streamId, JSON.stringify(inputGen)])
        return true
    } catch (err) {
        logger.error(
            `Error setting cached input gen for streamId=${streamId}: ${JSON.stringify(err)}.`
        )
        return false
    }
}

export async function getCachedInputGenForStreamId(streamId: string): Promise<StringKeyMap | null> {
    try {
        const results = (await redis?.hmGet(keys.TEST_STREAM_INPUT_GEN, streamId)) || []
        return (results?.length ? JSON.parse(results[0]) : []) as StringKeyMap
    } catch (err) {
        logger.error(`Error getting cached input gen for streamId=${streamId}: ${err}`)
        return null
    }
}

export async function deleteCachedInputGenForStreamId(streamId: string): Promise<boolean> {
    try {
        await redis?.hDel(keys.TEST_STREAM_INPUT_GEN, streamId)
        return true
    } catch (err) {
        logger.error(`Error deleting cached input gen for streamId=${streamId}: ${err}`)
        return false
    }
}

export async function getCachedFeaturedNamespaces(): Promise<string[]> {
    try {
        const results = await redis?.get(keys.FEATURED_NAMESPACES)
        return results ? JSON.parse(results) : []
    } catch (err) {
        logger.error(`Error getting featured namespaces from cache: ${err}`)
        return null
    }
}

export async function setCachedFeaturedNamespaces(namespaces: string[]): Promise<boolean> {
    try {
        await redis?.set(keys.FEATURED_NAMESPACES, JSON.stringify(namespaces))
        return true
    } catch (err) {
        logger.error(`Error setting featured namespaces in redis: ${err}`)
        return false
    }
}

export async function getDecodeJobRangeCount(key: string): Promise<number> {
    try {
        let count = Number(await redis?.get(key))
        return Number.isNaN(count) ? null : count
    } catch (err) {
        logger.error(`Error getting decode job range count for ${key}: ${err}`)
        return null
    }
}

export async function setDecodeJobRangeCount(key: string, value: number) {
    try {
        await redis?.set(key, value.toString())
    } catch (err) {
        throw `Error setting decode job range count to ${value}: ${err}`
    }
}

export async function getDecodeJobProgress(key: string): Promise<number> {
    try {
        let count = Number(await redis?.get(key))
        return Number.isNaN(count) ? 0 : count
    } catch (err) {
        logger.error(`Error getting decode job progress for ${key}: ${err}`)
        return 0
    }
}

export async function setDecodeJobProgress(key: string, value: number) {
    try {
        await redis?.set(key, value.toString())
        return true
    } catch (err) {
        throw `Error setting decode job progress to ${value}: ${err}`
    }
}

export async function deleteCoreRedisKeys(keys: string[]) {
    try {
        await redis?.del(keys)
        return true
    } catch (err) {
        logger.error(`Error deleting decode job keys: ${err}`)
        return false
    }
}
