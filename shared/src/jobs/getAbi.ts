import logger from '../lib/logger'
import { abiRedis, enqueueDelayedJob } from '..'
import { exit } from 'process'
import { getAbi } from '../lib/abi/redis'

async function perform(address: string, fetchIfNotThere: boolean = true) {
    await abiRedis.connect()

    const abi = await getAbi(address)
    if (!abi) {
        abi.forEach((item) => console.log(item))
    } else {
        logger.info('No ABI found.')

        if (fetchIfNotThere) {
            logger.info('Fetching ABI...')
            await enqueueDelayedJob('upsertAbis', { addresses: [address] })
        }
    }

    exit(0)
}

export default perform
