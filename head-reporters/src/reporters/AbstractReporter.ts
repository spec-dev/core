import { logger } from '../../../shared'

class AbstractReporter {
    
    chainId: string

    constructor(chainId: string) {
        this.chainId = chainId
    }

    async listen() {
        logger.info(`Listening for new heads on chain ${this.chainId}...`)
    }
}

export default AbstractReporter
