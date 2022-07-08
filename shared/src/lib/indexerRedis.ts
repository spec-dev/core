import { createClient } from 'redis'
import config from './config'
import logger from './logger'

// Create redis client.
const redis = createClient(config.INDEXER_REDIS_URL)

// Log any redis client errors.
redis.on('error', (err) => logger.error(`Redis error: ${err}`))

export { redis }
