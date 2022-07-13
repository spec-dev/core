import AbstractReporter from './AbstractReporter';
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import processNewHead from '../services/processNewHead'
import config from '../config'
import { logger } from 'shared'

class EthereumReporter extends AbstractReporter {
    web3: AlchemyWeb3

    constructor(chainId: number) {
        super(chainId)
        this.web3 = createAlchemyWeb3(config.ALCHEMY_SUBSCRIPTION_URL)
    }

    async listen() {
        super.listen()
        this.web3.eth
            .subscribe('newBlockHeaders')
            .on('data', data => processNewHead(this.chainId, data))
            .on('error', e => logger.error('Alchemy subscription error', e))
    }
}

export default EthereumReporter