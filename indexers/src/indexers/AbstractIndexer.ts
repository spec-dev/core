import {
    NewReportedHead,
    logger,
    quickUncleCheck,
    numberToHex,
    StringKeyMap,
} from '../../../shared'
import config from '../config'

class AbstractIndexer {
    head: NewReportedHead

    resolvedBlockHash: string | null

    blockUnixTimestamp: number | null

    get chainId(): number {
        return this.head.chainId
    }

    get blockNumber(): number {
        return this.head.blockNumber
    }

    get hexBlockNumber(): string {
        return numberToHex(this.blockNumber)
    }

    get blockHash(): string | null {
        return this.head.blockHash || this.resolvedBlockHash
    }

    get logPrefix(): string {
        return `[${this.chainId}:${this.blockNumber}]`
    }

    get pgBlockTimestamp(): string {
        return `timezone('UTC', to_timestamp(${this.blockUnixTimestamp}))`
    }

    constructor(head: NewReportedHead) {
        this.head = head
        this.resolvedBlockHash = null
        this.blockUnixTimestamp = null
    }

    async perform(): Promise<StringKeyMap | void> {
        config.IS_RANGE_MODE ||
            logger.info(
                `\n${this.logPrefix} Indexing block ${this.blockNumber} (${this.blockHash})...`
            )

        if (this.head.replace) {
            this._info(`GOT REORG -- Uncling existing block ${this.blockNumber}...`)
            await this._deleteRecordsWithBlockNumber()
        }
    }

    async _deleteRecordsWithBlockNumber() {
        throw 'must implement in child class'
    }

    async _wasUncled(): Promise<boolean> {
        if (config.IS_RANGE_MODE) return false
        return await quickUncleCheck(this.chainId, this.blockHash)
    }

    async _info(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.info(`${this.logPrefix} ${msg}`, ...args)
    }

    async _warn(msg: any, ...args: any[]) {
        logger.warn(`${this.logPrefix} ${msg}`, ...args)
    }

    async _error(msg: any, ...args: any[]) {
        logger.error(`${this.logPrefix} ${msg}`, ...args)
    }
}

export default AbstractIndexer
