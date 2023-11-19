import config from '../config'
import JSONStream from 'JSONStream'
import {
    logger,
    StringKeyMap,
    SharedTables,
    sleep,
    uniqueByKeys,
    unique,
    normalizeEthAddress,
    normalizeByteData,
    toString,
    EvmTransaction,
    EvmReceipt,
    In,
    schemaForChainId,
    mapByKey,
    toChunks,
} from '../../../shared'
import { exit } from 'process'
import https from 'https'
import { ident } from 'pg-format'
import { createWsProviderPool, getWsProviderPool } from '../wsProviderPool'

const evmReceipts = () => SharedTables.getRepository(EvmReceipt)

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
        createWsProviderPool(true, 0)
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

        // Get block number and timestamp through blocks.
        const uniqueBlockHashes = unique(transactions.map(t => t.blockHash))
        const addedBlockData = await this._getAddedBlockData(uniqueBlockHashes)
        for (const tx of transactions) {
            const data = addedBlockData[tx.blockHash]
            if (!data) continue
            const { number, timestamp } = data
            tx.blockNumber = Number(number)
            tx.blockTimestamp = new Date(timestamp).toISOString()
        }
        transactions = transactions.filter(tx => !!tx.blockTimestamp)

        // Get all receipts for txs.
        const uniqueTxHashes = unique(transactions.map(t => t.hash))
        const receipts = await evmReceipts().find({ where: { transactionHash: In(uniqueTxHashes) }})
        const receiptsByHash = mapByKey(receipts, 'transactionHash')
        const missingReceiptTxHashes = transactions.filter(tx => !receiptsByHash[tx.hash]).map(tx => tx.hash)

        // Go resolve all missing receipts.
        const missingReceipts = await this._resolveReceipts(missingReceiptTxHashes)
        for (const receipt of missingReceipts) {
            if (!receipt) continue
            receiptsByHash[receipt.transactionHash] = receipt
        }
        for (const tx of transactions) {
            const receipt = receiptsByHash[tx.hash]
            if (!receipt) throw `No receipt found for tx ${tx.hash}`
            tx.contractAddress = receipt.contractAddress
            tx.status = receipt.status
            tx.root = receipt.root
            tx.gasUsed = receipt.gasUsed
            tx.cumulativeGasUsed = receipt.cumulativeGasUsed
            tx.effectiveGasPrice = receipt.effectiveGasPrice
        }

        await SharedTables.manager.transaction(async (tx) => {
            await tx.createQueryBuilder()
                .insert()
                .into(EvmTransaction)
                .values(transactions)
                .orIgnore()
                .execute()
        })
    }

    async _resolveReceipts(hashes: string[]) {
        const chunks = toChunks(hashes, 40)
        const receipts = []
        for (const chunk of chunks) {
            await sleep(120)
            receipts.push(...(await Promise.all(chunk.map(hash => this._receiptForHash(hash)))))
        }
        return receipts
    }

    async _receiptForHash(hash: string) {
        const receipt = await getWsProviderPool().getTxReceipt(hash)
        if (!receipt) return null
        return {
            transactionHash: receipt.transactionHash,
            contractAddress: receipt.contractAddress,
            status: receipt.status ? 1 : 0,
            gasUsed: toString(receipt.gasUsed),
            cumulativeGasUsed: toString(receipt.cumulativeGasUsed),
            effectiveGasPrice: toString(receipt.effectiveGasPrice),
        }
    }

    _bigQueryModelToInternalModel(bqTx: StringKeyMap): StringKeyMap {
        return {
            hash: bqTx.transaction_hash,
            nonce: Number(bqTx.nonce),
            transactionIndex: Number(bqTx.transaction_index),
            from: bqTx.from_address ? normalizeEthAddress(bqTx.from_address, false) : null,
            to: bqTx.to_address ? normalizeEthAddress(bqTx.to_address, false) : null,
            value: bqTx.value?.string_value,
            input: normalizeByteData(bqTx.input),
            transactionType: bqTx.transaction_type ? Number(bqTx.transaction_type) : null,
            gas: toString(bqTx.gas) || null,
            gasPrice: toString(bqTx.gas_price?.string_value) || null,
            maxFeePerGas: toString(bqTx.max_fee_per_gas) || null,
            maxPriorityFeePerGas: toString(bqTx.max_priority_fee_per_gas) || null,
            blockHash: bqTx.block_hash,
        }
    }

    _sliceToUrl(slice: number): string {
        const paddedSlice = this._padNumberWithLeadingZeroes(slice, 12)
        return `https://storage.googleapis.com/spec_eth/${schemaForChainId[config.CHAIN_ID]}-transactions/records-${paddedSlice}.json`
    }

    _padNumberWithLeadingZeroes(val: number, length: number): string {
        let result = val.toString()
        while (result.length < length) {
            result = '0' + result
        }
        return result
    }

    async _getAddedBlockData(hashes: string[]): Promise<StringKeyMap> {
        const schema = schemaForChainId[config.CHAIN_ID]
        let i = 1
        const placeholders = []
        for (const hash of hashes) {
            placeholders.push(`$${i}`)
            i++
        }
        const results = await SharedTables.query(
            `select number, timestamp, hash from ${ident(schema)}.blocks where hash in (${placeholders.join(', ')})`,
            hashes,
        )
        const m = {}
        for (const { number, timestamp, hash } of results) {
            m[hash] = { number, timestamp }
        }
        return m
    }
}

export function getPullTransactionsWorker(): PullTransactionsWorker {
    return new PullTransactionsWorker(config.FROM, config.TO)
}