import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    SharedTables,
    PolygonTransaction,
    sleep,
    uniqueByKeys,
    normalizeEthAddress,
    normalizeByteData,
    toString,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'

class PullTransactionsWorker {
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
            await this._pullTransactionsForSlice(this.cursor)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullTransactionsForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamTransactions(resp)
    }

    async _streamTransactions(resp) {
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
            this.savePromises.push(this._saveTransactions([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveTransactions([...this.batch]))
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

    async _saveTransactions(transactions: StringKeyMap[]) {
        transactions = uniqueByKeys(transactions.map((l) => this._bigQueryModelToInternalModel(l)), ['hash'])

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(PolygonTransaction)
                .values(transactions)
                .orIgnore()
                .execute()
        })
    }

    _bigQueryModelToInternalModel(bqTx: StringKeyMap): StringKeyMap {
        return {
            hash: bqTx.hash,
            nonce: bqTx.nonce,
            transactionIndex: Number(bqTx.transaction_index),
            from: bqTx.from_address ? normalizeEthAddress(bqTx.from_address) : null,
            to: bqTx.to_address ? normalizeEthAddress(bqTx.to_address) : null,
            contractAddress: bqTx.contract_address ? normalizeEthAddress(bqTx.receipt_contract_address) : null,
            value: bqTx.value,
            input: normalizeByteData(bqTx.input),
            status: bqTx.receipt_status === null ? null : Number(bqTx.receipt_status),
            gas: toString(bqTx.gas) || null,
            gasPrice: toString(bqTx.gas_price) || null,
            gasUsed: toString(bqTx.receipt_gas_used) || null,
            cumulativeGasUsed: toString(bqTx.receipt_cumulative_gas_used) || null,
            blockHash: bqTx.block_hash,
            blockNumber: Number(bqTx.block_number),
            blockTimestamp: new Date(bqTx.block_timestamp).toISOString(),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/polygon-transactions/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullTransactionsWorker(): PullTransactionsWorker {
    return new PullTransactionsWorker(config.FROM, config.TO)
}