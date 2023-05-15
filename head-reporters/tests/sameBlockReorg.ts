import config from '../src/config'
import { CoreDB, IndexerDB, indexerRedis, SharedTables, randomIntegerInRange } from '../../shared'
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
    let number = 42627494
    let lastReorgAt = number
    setInterval(() => {
        if (number - lastReorgAt === 10) {
            lastReorgAt = number
        } else {
            number++
        }
        reporter._onNewBlockHeader(newFakeBlockHeader(number))
    }, randomIntegerInRange(2900, 3000))
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