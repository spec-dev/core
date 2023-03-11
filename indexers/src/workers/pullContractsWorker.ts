import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    SharedTables,
    uniqueByKeys,
    normalizeEthAddress,
    PolygonContract,
    sleep,
} from '../../../shared'
import { 
    isContractERC20, 
    isContractERC721, 
    isContractERC1155,
} from '../services/contractServices'
import { exit } from 'process'
import https from 'https'

class PullContractsWorker {
    from: number

    to: number

    cursor: number

    saveBatchSize: number = 5000

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
            await this._pullContractsForSlice(this.cursor)
            this.cursor++
        }
        logger.info('DONE')
        exit(0)
    }

    async _pullContractsForSlice(slice: number) {
        const abortController = new AbortController()
        const initialRequestTimer = setTimeout(() => abortController.abort(), 20000)
        const resp = await this._makeSliceRequest(slice, abortController)
        clearTimeout(initialRequestTimer)
        await this._streamContracts(resp)
    }

    async _streamContracts(resp) {
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
            this.savePromises.push(this._saveContracts([...this.batch]))
        }

        await Promise.all(this.savePromises)
    }

    _createJSONStream() {
        this.jsonStream = JSONStream.parse()
        this.jsonStream.on('data', (data) => {
            this.batch.push(data as StringKeyMap)
            if (this.batch.length === this.saveBatchSize) {
                this.savePromises.push(this._saveContracts([...this.batch]))
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

    async _saveContracts(contracts: StringKeyMap[]) {
        contracts = uniqueByKeys(
            contracts.map((l) => this._bigQueryModelToInternalModel(l)),
            ['address']
        )

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(PolygonContract)
                .values(contracts)
                .orIgnore()
                .execute()
        })
    }

    _bigQueryModelToInternalModel(bqContract: StringKeyMap): StringKeyMap {
        const { address, bytecode, block_hash, block_number, block_timestamp } = bqContract
        const isERC20 = bqContract.is_erc20 || (bytecode ? isContractERC20(bytecode) : false)
        const isERC721 = bqContract.is_erc721 || (bytecode ? isContractERC721(bytecode) : false)
        const isERC1155 = bytecode ? isContractERC1155(bytecode) : false
        return {
            address: normalizeEthAddress(address),
            bytecode,
            isERC20,
            isERC721,
            isERC1155,
            blockHash: block_hash,
            blockNumber: Number(block_number),
            blockTimestamp: new Date(block_timestamp).toISOString(),
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/polygon-contracts/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }
}

export function getPullContractsWorker(): PullContractsWorker {
    return new PullContractsWorker(config.FROM, config.TO)
}