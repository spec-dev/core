import config from '../config'
import {
    logger,
    abiRedis,
    removeAbis,
    sleep,
} from '../../../shared'
import { exit } from 'process'

const keepAddresses = new Set([
    '0x12392f67bdf24fae0af363c24ac620a2f67dad86',
    '0x3df697ff746a60cbe9ee8d47555c88cb66f03bb9',
    '0x1292e6df9a4697daafddbd61d5a7545a634af33d',
    '0x17b67e5bdfcf5df34711d151da3422821bed2ae6',
    '0xdbd27635a534a3d3169ef0498beb56fb9c937489',
    '0x17317f96f0c7a845ffe78c60b10ab15789b57aaa',
    '0xeff187b4190e551fc25a7fa4dfc6cf7fdef7194f',
    '0x8568133ff3ef0bd108868278cb2a516eaa3b8abf',
    '0x931519d41797c73b9ce993b52c1af900373b5b43',
    '0x65786714ed6af687a6d99f07eeca39847cfcb8be',
    '0xe0281a20dfacb0e179e6581c33542bc533ddc4ab',
    '0x0ff5962bc56ba0cf6d7d6ef90df274ae5dc4d16a',
    '0x3fa902a571e941dcac6081d57917994ddb0f9a9d',
    '0xe65cdb6479bac1e22340e4e755fae7e509ecd06c',
    '0x35a18000230da775cac24873d00ff85bccded550',
    '0x2ed6c4b5da6378c7897ac67ba9e43102feb694ee',
    '0x2172758ebb894c43e0be01e37d065118317d7eec',
    '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
    '0xfce05688b59bd8491f99cc5dcd34ce1b2175741f',
    '0x96f1ba24294ffe0dfcd832d8376da4a4645a4cd6',
    '0xbf4e6c28d7f37c867ce62cf6ccb9efa4c7676f7f',
    '0x7b94f57652cc1e5631532904a4a038435694636b',
    '0x03506ed3f57892c85db20c36846e9c808afe9ef4',
    '0xef13efa565fb29cd55ecf3de2beb6c69bd988212',
    '0xde3e5a990bce7fc60a6f017e7c4a95fc4939299e',
    '0x3e7f72dfedf6ba1bcbfe77a94a752c529bb4429e',
    '0x158079ee67fce2f58472a96584a73c7ab9ac95c1',
    '0x8b0a28a8de1de77668260a876c6dcf0330183742',
    '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    '0x6640e4fb3fd56a6d7dff3c351dfd9ab7e57fb769',
    '0xf741f7b6a4cb3b4869b2e2c01ab70a12575b53ab',
    '0xf5dce57282a584d2746faf1593d3121fcac444dc',
    '0x5770b7a57bd252fc4bb28c9a70c9572ae6400e48',
    '0xe2bf906f7d10f059ce65769f53fe50d8e0cc7cbe',
    '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407',
    '0x80ae0e6048d6e295ee6520b07eb6ec4485193fd6',
    '0xb0cd4333a9aa432144b678f8ec87ed88a44e151f',
    '0x1eec6eccaa4625da3fa6cd6339dbcc2418710e8a',
    '0x5030e1a81330d5098473e8d309e116c2792202eb',
    '0xccf4429db6322d5c611ee964527d42e5d685dd6a',
    '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
    '0x23b9467334beb345aaa6fd1545538f3d54436e96',
    '0x44aa9c5a034c1499ec27906e2d427b704b567ffe',
    '0x21b0be8253deda0d2d8f010d06ed86093d52359b',
    '0x57a8865cfb1ecef7253c27da6b4bc3daee5be518',
    '0x832c5391dc7931312cbdbc1046669c9c3a4a28d5',
    '0xface851a4921ce59e912d19329929ce6da6eb0c7',
    '0xb0298c5540f4cfb3840c25d290be3ef3fe09fa8c',
    '0xa31ff85e840ed117e172bc9ad89e55128a999205',
    '0x80a2ae356fc9ef4305676f7a3e2ed04e12c33946',
    '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
    '0x395b1b4cbd34c1ec7aaf47e6bf2a2356af558fe2',
    '0x041171993284df560249b57358f931d9eb7b925d',
    '0xdb46d1dc155634fbc732f92e853b10b288ad5a1d',
    '0xb05bae098d2b0e3048de27f1931e50b0200a043b',
    '0x39aa39c021dfbae8fac545936693ac917d5e7563',
    '0xfaf2b3ad1b211a2fe5434c75b50d256069d1b51f',
    '0x95b4ef2869ebd94beb4eee400a99824bf5dc325b',
    '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4',
    '0x4b0181102a0112a2ef11abee5563bb4a3176c9d7',
    '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
    '0xde30da39c46104798bb5aa3fe8b9e0e1f348163f',
    '0x548c775c4bd61d873a445ee4e769cf1a18d60ea9',
    '0x057ccdf5153be1081830a6c3d507c9dfe1ac8e4e',
    '0x7713dd9ca933848f6819f38b8352d9a15ea73f67',
    '0xd94c0ce4f8eefa4ebf44bf6665688edeef213b33',
])

class TrimAbisWorker {

    from: number 

    to: number | null

    groupSize: number

    cursor: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
    }

    async run() {
        let cursor = null
        let addresses
        let count = 0
        while (true) {
            const results = await this._getAbisBatch(cursor || 0)
            cursor = results[0]
            addresses = results[1]
            count += 2500
            logger.info('\nCOUNT', count.toLocaleString())

            const addressesToRemove = addresses.filter(a => !keepAddresses.has(a))
            await removeAbis(addressesToRemove, config.CHAIN_ID)
            await sleep(200)
            if (cursor === 0) break
        }
        logger.info('DONE')
        exit()
    }

    async _getAbisBatch(inputCursor: number) {
        let results
        try {
            results = await abiRedis.hScan('eth-contracts', inputCursor, { COUNT: 2500, MATCH: '*' })
        } catch (err) {
            logger.error(`Error getting ABIs: ${err}.`)
            return []
        }

        const cursor = results.cursor
        const tuples = results.tuples || []
        const batch = []
        for (const entry of tuples) {
            const address = entry.field
            batch.push(address)
        }
        return [cursor, batch]
    }
}

export function getTrimAbisWorker(): TrimAbisWorker {
    return new TrimAbisWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}