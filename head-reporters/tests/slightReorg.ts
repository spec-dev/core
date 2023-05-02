import config from '../src/config'
import { CoreDB, IndexerDB, indexerRedis, SharedTables, range, randomIntegerInRange, sleep } from '../../shared'
import { EvmReporter } from '../src/reporters'
import { BlockHeader } from 'web3-eth'

function newFakeBlockHeader(number: number): BlockHeader {
    return {
        number: number,
        hash: `0xhash${number}`,
        parentHash: '',
        nonce: '',
        sha3Uncles: '',
        logsBloom: '',
        transactionRoot: '',
        stateRoot: '',
        receiptsRoot: '',
        miner: '',
        extraData: '',
        gasLimit: 0,
        gasUsed: 0,
        timestamp: new Date().toISOString(),    
    }
} 

async function fakeNewHeads(reporter: EvmReporter) {
    let number = 17171912
    let lastReorgAt = number
    setInterval(async() => {
        if (number - lastReorgAt === 10) {
            lastReorgAt = number
            for (const n of range(number - 3, number)) {
                reporter._onNewBlockHeader(newFakeBlockHeader(n))
                await sleep(30)
            }
        } else {
            number++
            reporter._onNewBlockHeader(newFakeBlockHeader(number))
        }
    }, randomIntegerInRange(12000, 13000))
}

async function listen() {
    await Promise.all([
        CoreDB.initialize(),
        SharedTables.initialize(),
        IndexerDB.initialize(),
        indexerRedis.connect(),
    ])
    const reporter = new EvmReporter(config.CHAIN_ID)
    await fakeNewHeads(reporter)
}

listen()