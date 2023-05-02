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

const numbers = [
    42206170,
    42206171,
    42206172,
    42206173,
    42206174,
    42206175,
    42206176,
    42206177,
    42206178,
    42206179,
    42206180,
    [42206177, 42206178, 42206179, 42206180],
    42206181,
    42206182,
    42206183,
    42206184,
    42206185,
    42206186,
    42206187,
    42206188,
    42206189,
    42206190,
    42206191,
    42206192,
    42206193,
    42206194,
    42206195,
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
    }, randomIntegerInRange(1500, 2000))
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