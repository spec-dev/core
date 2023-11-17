import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    EvmReceipt,
    SharedTables,
    uniqueByKeys,
    normalizeEthAddress,
    normalize32ByteHash,
    toString,
    sleep,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'

class PullReceiptsWorker {
    
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
            await this._pullReceiptsForSlice(this.cursor)
            await sleep(1000)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullReceiptsForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamReceipts(resp)
    }

    async _streamReceipts(resp) {
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
            this.savePromises.push(this._saveReceipts([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveReceipts([...this.batch]))
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
                    logger.error(`Error fetching JSON slice ${slice}:`, error)
                    if (attempt <= 3) {
                        logger.error(`Retrying with attempt ${attempt}...`)
                        await sleep(50)
                        return this._makeSliceRequest(slice, abortController, attempt + 1)
                    }
                })
        })
    }

    async _saveReceipts(receipts: StringKeyMap[]) {
        receipts = uniqueByKeys(
            receipts.map((l) => this._bigQueryReceiptToReceipt(l)),
            ['transactionHash']
        )

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(EvmReceipt)
                .values(receipts)
                .orIgnore()
                .execute()
        })

        await sleep(100)
    }

    _bigQueryReceiptToReceipt(r: StringKeyMap): StringKeyMap {
        return {
            transactionHash: r.transaction_hash,
            contractAddress: normalizeEthAddress(r.contract_address, false),
            status: r === null ? null : Number(r.status),
            root: normalize32ByteHash(r.root),
            gasUsed: toString(r.gas_used),
            cumulativeGasUsed: toString(r.cumulative_gas_used),
            effectiveGasPrice: toString(r.effective_gas_price),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/optimism-receipts/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullReceiptsWorker(): PullReceiptsWorker {
    return new PullReceiptsWorker(config.FROM, config.TO)
}
