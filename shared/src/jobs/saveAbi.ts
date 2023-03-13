import { abiRedis } from '..'
import { exit } from 'process'
import { saveAbis } from '../lib/abi/redis'

async function perform(address: string, chainId: string, abi: string) {
    await abiRedis.connect()
    const abis = {}
    abis[address] = abi
    await saveAbis(abis, chainId)
    exit(0)
}

export default perform