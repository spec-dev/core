import { redis } from '../lib/core/redis'
import { exit } from 'process'

async function perform() {
    await redis.connect()
    await redis.del('lajaijveutrfanbufusu')
    await redis.del('lajaijveutrfanbufusu-staging')
    exit(0)
}

export default perform
