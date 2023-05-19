import config from '../src/config'
import { CoreDB, IndexerDB, indexerRedis, SharedTables, range, randomIntegerInRange, sleep } from '../../shared'
import { EvmReporter } from '../src/reporters'
import { BlockHeader } from 'web3-eth'

function newFakeBlockHeader(number: number): BlockHeader {
    return {
        number: number,
        hash: null,
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
        timestamp: Math.floor(Date.now() / 1000)
    }
} 

async function fakeNewHeads(reporter: EvmReporter) {
    let number = 17290932
    let lastReorgAt = number
    let hasFlipped = false
    setInterval(async() => {
        if (!hasFlipped && number - lastReorgAt === 5) {
            hasFlipped = true
            lastReorgAt = number
            for (const n of range(number - 3, number)) {
                reporter._onNewBlockHeader(newFakeBlockHeader(n))
                await sleep(30)
            }
        } else {
            number++
            reporter._onNewBlockHeader(newFakeBlockHeader(number))
        }
    }, randomIntegerInRange(10000, 11000))
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