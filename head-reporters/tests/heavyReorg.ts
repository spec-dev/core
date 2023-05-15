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

const numbers = [
    42317975,
    42317976,
    42317977,
    42317978,
    42317979,
    [42317976, 42317977, 42317978, 42317979],
    42317980,
    42317981,
    42317982,
    42317983,
    42317984,
    42317985,
    42317986,
    42317987,
]

async function fakeNewHeads(reporter: EvmReporter) {
    let i = 0
    setInterval(async() => {
        const entry = numbers[i]
        if (!entry) return
        if (Array.isArray(entry)) {
            for (const number of entry) {
                reporter._onNewBlockHeader(newFakeBlockHeader(number))
                await sleep(20)
            }
        } else {
            reporter._onNewBlockHeader(newFakeBlockHeader(entry))
        }
        i++
    }, randomIntegerInRange(1800, 2200))
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