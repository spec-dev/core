import { logger, indexerRedis, SharedTables, CoreDB, abiRedis } from '../../shared'
import { getWorker } from './worker'
import registerContractInstances from './jobs/registerContractInstances'

async function run() {
    await Promise.all([
        CoreDB.initialize(),
        SharedTables.initialize(),
        indexerRedis.connect(),
        abiRedis.connect(),
    ])
    logger.info('Starting delayed jobs worker...')
    // getWorker().run()

    const payload = {
        nsp: 'compound',
        chainId: '1',
        contracts: [
            {
                name: 'cToken',
                desc: 'Compound cToken contracts',
                instances: [
                    {
                        address: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
                        name: 'cUSDC',
                        desc: 'todo',
                    },
                    {
                        address: '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
                        name: 'cDAI',
                        desc: 'todo',
                    },
                    {
                        address: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
                        name: 'cETH',
                        desc: 'todo',
                    },
                    {
                        address: '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407',
                        name: 'cZRX',
                        desc: 'todo',
                    },
                    {
                        address: '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
                        name: 'cBAT',
                        desc: 'todo',
                    },
                ],
            },
        ],
    }

    await registerContractInstances(payload).perform()
}

run()