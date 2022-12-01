import logger from '../lib/logger'
import { abiRedis, enqueueDelayedJob } from '..'
import { exit } from 'process'
import { getAbi } from '../lib/abi/redis'

async function perform(address: string, chainId: string, fetchIfNotThere: boolean = false) {
    await abiRedis.connect()

    address = address.toLowerCase()
    const abi = await getAbi(address, chainId)
    if (abi) {
        abi.forEach((item) => {
            console.log(JSON.stringify(item))
        })
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
