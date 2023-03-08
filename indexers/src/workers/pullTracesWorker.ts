import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    SharedTables,
    PolygonTrace,
    sleep,
    uniqueByKeys,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'

class PullTracesWorker {
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
            await this._pullTracesForSlice(this.cursor)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullTracesForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamTraces(resp)
    }

    async _streamTraces(resp) {
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
            this.savePromises.push(this._saveTraces([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveTraces([...this.batch]))
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

    async _saveTraces(traces: StringKeyMap[]) {
        traces = uniqueByKeys(traces.map((l) => this._bigQueryModelToInternalModel(l)), ['id'])

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(PolygonTrace)
                .values(traces)
                .orIgnore()
                .execute()
        })
    }

    _bigQueryModelToInternalModel(bqTrace: StringKeyMap): StringKeyMap {
        return {
            id: bqTrace.trace_id,
            from: bqTrace.from_address,
            to: bqTrace.to_address,
            value: bqTrace.value,
            input: bqTrace.input,
            output: bqTrace.output,
            traceType: bqTrace.trace_type,
            callType: bqTrace.call_type,
            rewardType: bqTrace.reward_type,
            subtraces: bqTrace.subtraces === null ? null : Number(bqTrace.subtraces),
            traceAddress: bqTrace.trace_address,
            error: bqTrace.error,
            status: bqTrace.status === null ? null : Number(bqTrace.status),
            gas: bqTrace.gas,
            gasUsed: bqTrace.gas_used,
            blockHash: bqTrace.block_hash,
            blockNumber: Number(bqTrace.block_number),
            blockTimestamp: new Date(bqTrace.block_timestamp).toISOString(),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/polygon-traces/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullTracesWorker(): PullTracesWorker {
    return new PullTracesWorker(config.FROM, config.TO)
}