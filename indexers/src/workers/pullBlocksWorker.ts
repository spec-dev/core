import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    SharedTables,
    EvmBlock,
    sleep,
    uniqueByKeys,
    normalizeEthAddress,
    normalizeByteData,
    normalize32ByteHash,
    toString,
    attemptToParseNumber,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'

class PullBlocksWorker {
    from: number

    to: number

    cursor: number

    saveBatchSize: number = 2000

    jsonStream: JSONStream

    batch: StringKeyMap[] = []

    savePromises: any[] = []

    constructor(from: number, to: number) {
        this.from = from
        this.to = to
        this.cursor = from
    }

    async run() {
        while (this.cursor <= this.to) {
            logger.info(`Slice ${this.cursor} / ${this.to}`)
            await this._pullBlocksForSlice(this.cursor)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullBlocksForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamBlocks(resp)
    }

    async _streamBlocks(resp) {
        this.batch = []
        this.savePromises = []

        this._createJSONStream()

        const readData = () =>
            new Promise((resolve, _) => {
                resp.on('data', async (chunk) => {
                    this.jsonStream.write(chunk)
                })
                resp.on('end', () => resolve(null))
            })

        try {
            await readData()
        } catch (err) {
            logger.error(`Error iterating response stream: ${err?.message || err}`)
        }

        if (this.batch.length) {
            this.savePromises.push(this._saveBlocks([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveBlocks([...this.batch]))
                this.batch = []
            }
        })
    }

    async _makeSliceRequest(
        slice: number,
        abortController: AbortController,
        attempt = 1
    ): Promise<any> {
        return new Promise((resolve, _) => {
            https
                .get(this._sliceToUrl(slice), (resp) => {
                    resolve(resp)
                })
                .on('error', async (error) => {
                    const err = JSON.stringify(error)
                    if (!err.includes('ECONNRESET')) {
                        logger.error(`Error fetching JSON slice ${slice}:`, error)
                    }
                    if (attempt <= 10) {
                        if (!err.includes('ECONNRESET')) {
                            logger.error(`Retrying with attempt ${attempt}...`)
                        }
                        await sleep(100)
                        return this._makeSliceRequest(slice, abortController, attempt + 1)
                    }
                })
        })
    }

    async _saveBlocks(blocks: StringKeyMap[]) {
        blocks = uniqueByKeys(blocks.map((l) => this._bigQueryModelToInternalModel(l)), ['number'])

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(EvmBlock)
                .values(blocks)
                .orIgnore()
                .execute()
        })
    }

    _bigQueryModelToInternalModel(bqBlock: StringKeyMap): StringKeyMap {
        return {
            hash: bqBlock.block_hash,
            number: Number(bqBlock.block_number),
            parentHash: normalize32ByteHash(bqBlock.parent_hash),
            nonce: bqBlock.nonce,
            sha3Uncles: normalize32ByteHash(bqBlock.uncles_sha3),
            logsBloom: normalizeByteData(bqBlock.logs_bloom),
            transactionsRoot: normalize32ByteHash(bqBlock.transactions_root),
            stateRoot: normalize32ByteHash(bqBlock.state_root),
            receiptsRoot: normalize32ByteHash(bqBlock.receipts_root),
            miner: normalizeEthAddress(bqBlock.miner),
            difficulty: bqBlock.difficulty?.string_value,
            totalDifficulty: bqBlock.total_difficulty?.string_value,
            size: attemptToParseNumber(bqBlock.size),
            extraData: normalizeByteData(bqBlock.extra_data),
            gasLimit: toString(bqBlock.gas_limit),
            gasUsed: toString(bqBlock.gas_used),
            transactionCount: Number(bqBlock.transaction_count || 0),
            timestamp: new Date(bqBlock.block_timestamp).toISOString(),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/optimism-blocks/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullBlocksWorker(): PullBlocksWorker {
    return new PullBlocksWorker(config.FROM, config.TO)
}