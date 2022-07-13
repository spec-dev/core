import { createClient } from 'redis'
import config from '../config'
import logger from '../logger'

// Create redis client.
export const redis = createClient(config.INDEXER_REDIS_URL)

// Log any redis client errors.
redis.on('error', (err) => logger.error(`Redis error: ${err}`))

const keys = {
    UNCLED_BLOCKS: 'uncled-blocks',
}

const formatUncledBlockValue = (chainId: number, blockHash: string) => `${chainId}:${blockHash}`

export async function registerBlockHashAsUncled(chainId: number, blockHash: string) {
    const value = formatUncledBlockValue(chainId, blockHash)
    try {
        await redis.sAdd(keys.UNCLED_BLOCKS, value)
    } catch (err) {
        logger.error(`Error adding ${value} to ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }
}

export async function quickUncleCheck(chainId: number, blockHash: string): Promise<boolean> {
    if (!blockHash) return false
    const value = formatUncledBlockValue(chainId, blockHash)
    try {
        return await redis.sIsMember(keys.UNCLED_BLOCKS, value)
    } catch (err) {
        logger.error(`Error checking if ${value} is a member of ${keys.UNCLED_BLOCKS} set: ${err}.`)
    }

    return false
}
