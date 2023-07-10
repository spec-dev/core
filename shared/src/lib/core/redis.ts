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
    LATEST_TOKEN_PRICES: 'latest-token-prices',
    TEST_STREAM_INPUT_GEN: 'test-stream-input-gen',
    FEATURED_NAMESPACES: 'featured-namespaces',
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