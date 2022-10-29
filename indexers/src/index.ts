import config from './config'
import {
    logger,
    indexerRedis,
    IndexerDB,
    SharedTables,
    CoreDB,
    upsertContractCaches,
    getAbi,
    abiRedis,
} from '../../shared'
import { getWorker } from './workers'

import Web3 from 'web3'
const web3 = new Web3()
const anotherWeb3 = new Web3('https://eth-mainnet.g.alchemy.com/v2/-ZWlJMwtKBGm_L04mia-tfGvfBipwtXs')

async function run() {
    // Start all databases.
    await Promise.all([
        IndexerDB.initialize(),
        SharedTables.initialize(),
        CoreDB.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
    ])

    // // Make sure verified contracts and instances are cached.
    // await upsertContractCaches()

    // logger.info(
    //     config.IS_RANGE_MODE
    //         ? `Indexing block range ${config.FROM} -> ${config.TO}...`
    //         : `Listening for new block heads...`
    // )

    // const worker = await getWorker()
    // worker.run()


    const addr = '0x862309bd8802061293541645a1e09e677cfe571a'
    const abi = await getAbi(addr)

    for (const item of abi) {
        switch (item.type) {
            case 'function':
                console.log(web3.eth.abi.encodeFunctionSignature(item as any))
            case 'event':
                console.log(web3.eth.abi.encodeEventSignature(item as any))
        }
    }

    for (const item of abi) {
        switch (item.type) {
            case 'function':
                console.log(anotherWeb3.eth.abi.encodeFunctionSignature(item as any))
            case 'event':
                console.log(anotherWeb3.eth.abi.encodeEventSignature(item as any))
        }
    }
}

run()
