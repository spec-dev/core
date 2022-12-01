import AbstractReporter from './AbstractReporter'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import processNewHead from '../services/processNewHead'
import config from '../config'
import { logger } from '../../../shared'
import { BlockHeader } from 'web3-eth'

class EthereumReporter extends AbstractReporter {
    web3: AlchemyWeb3

    buffer: BlockHeader[] = []

    constructor(chainId: string) {
        super(chainId)
        this.web3 = createAlchemyWeb3(config.ALCHEMY_SUBSCRIPTION_URL)
    }

    async listen() {
        super.listen()
        this.web3.eth
            .subscribe('newBlockHeaders')
            .on('data', (data) => this._onData(data))
            .on('error', (e) => logger.error('Alchemy subscription error', e))
    }

    _onData(data: BlockHeader) {
        const bufferLength = this.buffer.length

        let replaced = false
        for (let i = 0; i < bufferLength; i++) {
            if (this.buffer[i].number === data.number) {
                this.buffer[i] = data
                replaced = true
                break
            }
        }

        if (!replaced) {
            this.buffer.push(data)
        }

        this.buffer = this.buffer.sort((a, b) => a.number - b.number)

        if (this.buffer.length > config.HEAD_BUFFER) {
            const head = this.buffer.shift()
            processNewHead(this.chainId, head)
        }
    }
}

export default EthereumReporter
