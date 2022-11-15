import { abiRedisKeys, getAbi, redis, saveAbis } from '../lib/abi/redis'
import { exit } from 'process'

async function perform() {
    const abi = await getAbi('0x395b1b4cbd34c1ec7aaf47e6bf2a2356af558fe2')
    if (!abi) {
        console.log('No abi found')
        return
    }

    const abiStr = JSON.stringify(abi)

    console.log('Saving abis...')

    await saveAbis({
        '0xfce05688b59bd8491f99cc5dcd34ce1b2175741f': abiStr,
        '0xb0cd4333a9aa432144b678f8ec87ed88a44e151f': abiStr,
    }, abiRedisKeys.POLYGON_CONTRACTS)

    exit(0)
}

export default perform