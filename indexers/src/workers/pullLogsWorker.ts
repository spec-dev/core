import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    EthLog,
    SharedTables,
    uniqueByKeys,
    normalizeEthAddress,
    normalizeByteData,
    sleep,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'

class PullLogsWorker {
    
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
        while (this.cursor < this.to) {
            logger.info(`Slice ${this.cursor} / ${this.to}`)
            await this._pullLogsForSlice(this.cursor)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullLogsForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamLogs(resp)
    }

    async _streamLogs(resp) {
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
            this.savePromises.push(this._saveLogs([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveLogs([...this.batch]))
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

    async _saveLogs(logs: StringKeyMap[]) {
        logs = uniqueByKeys(
            logs.map((l) => this._bigQueryLogToEthLog(l)),
            ['logIndex', 'transactionHash']
        )

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder().insert().into(EthLog).values(logs).orIgnore().execute()
        })
    }

    _bigQueryLogToEthLog(bqLog: StringKeyMap): StringKeyMap {
        const topics = bqLog.topics || []
        const topic0 = topics[0] || null
        const topic1 = topics[1] || null
        const topic2 = topics[2] || null
        const topic3 = topics[3] || null

        return {
            logIndex: Number(bqLog.log_index),
            transactionHash: bqLog.transaction_hash,
            transactionIndex: Number(bqLog.transaction_index),
            address: normalizeEthAddress(bqLog.address),
            data: normalizeByteData(bqLog.data),
            topic0,
            topic1,
            topic2,
            topic3,
            blockHash: bqLog.block_hash,
            blockNumber: Number(bqLog.block_number),
            blockTimestamp: new Date(bqLog.block_timestamp).toISOString(),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/logs/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullLogsWorker(): PullLogsWorker {
    return new PullLogsWorker(config.FROM, config.TO)
}
