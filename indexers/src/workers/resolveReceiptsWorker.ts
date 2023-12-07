import config from '../config'
import {
    logger,
    StringKeyMap,
    EvmReceipt,
    SharedTables,
    toChunks,
    schemaForChainId,
    sleep,
    ChainTables,
    In,
    normalizeEthAddress,
    hexToNumber,
    normalize32ByteHash,
    hexToNumberString,
} from '../../../shared'
import { exit } from 'process'
import short from 'short-uuid'
import { createWeb3Provider, getWeb3 } from '../httpProviderPool'

const evmReceipts = () => SharedTables.getRepository(EvmReceipt)

class ResolveReceiptsWorker {

    from: number

    to: number | null

    groupSize: number

    cursor: number

    batchResults: StringKeyMap[] = []

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        createWeb3Provider(true)
    }

    async run() {
        while (this.cursor <= this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            logger.info(`${start} -> ${end}`)
            await this._resolveRange(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.batchResults.length) {
            const batchResults = [...this.batchResults]
            await Promise.all(toChunks(batchResults, 2000).map(chunk => this._saveBatchResults(chunk)))
            this.batchResults = []
        }
        logger.info('DONE')
        exit()
    }

    async _resolveRange(start: number, end: number) {
        const { txHashes, blockNumberForHash }  = await this._getTxsHashesWithoutReceiptsInRange(start, end)
        if (!txHashes.length) return

        const receiptsMap = {}
        txHashes.forEach(hash => {
            receiptsMap[hash] = null
        })

        // const receiptsFromTable = await evmReceipts().find({ where: { transactionHash: In(txHashes) }})
        // receiptsFromTable.forEach(receipt => {
        //     receiptsMap[receipt.transactionHash] = receipt
        // })

        const remainingHashesToResolve = []
        for (const [hash, receipt] of Object.entries(receiptsMap)) {
            if (receipt) continue
            remainingHashesToResolve.push(hash)
        }

        const receiptsFromRPC = await this._getReceiptsFromRPC(remainingHashesToResolve, blockNumberForHash)
        receiptsFromRPC.forEach(receipt => {
            receiptsMap[receipt.transactionHash] = receipt
        })
        for (const hash in receiptsMap) {
            if (!receiptsMap[hash]) throw `[${config.CHAIN_ID}] No receipt resolved for hash ${hash}`
        }

        this.batchResults.push(...Object.values(receiptsMap))
        if (this.batchResults.length >= 2000) {
            const batchResults = [...this.batchResults]
            await Promise.all(toChunks(batchResults, 2000).map(chunk => this._saveBatchResults(chunk)))
            this.batchResults = []
        }
    }

    async _getTxsHashesWithoutReceiptsInRange(start, end) {
        const results = await SharedTables.query(
            `select hash, block_number from ${schemaForChainId[config.CHAIN_ID]}.transactions where block_number >= $1 and block_number <= $2 and status is null`,
            [start, end]
        )
        const txHashes = []
        const blockNumberForHash = {}
        for (const { hash, block_number } of results) {
            txHashes.push(hash)
            blockNumberForHash[hash] = Number(block_number)
        }
        return { txHashes, blockNumberForHash }
    }

    async _getReceiptsFromRPC(hashes: string[], blockNumberForHash: StringKeyMap) {
        if (!hashes.length) return []
        logger.info(`Getting ${hashes.length} receipts from RPC...`)

        const uniqueBlockNumbersSet = new Set()
        const hashesByBlockNumber = {}
        hashes.forEach(hash => {
            const blockNumber = blockNumberForHash[hash]
            uniqueBlockNumbersSet.add(blockNumber)
            hashesByBlockNumber[blockNumber] = hashesByBlockNumber[blockNumber] || []
            hashesByBlockNumber[blockNumber].push(hash)
        })

        const uniqueBlockNumbersChunks = toChunks(Array.from(uniqueBlockNumbersSet), 10)
        const receipts = []
        for (const blockNumbers of uniqueBlockNumbersChunks) {
            await sleep(100)
            receipts.push(...(await Promise.all(
                blockNumbers.map(n => getWeb3().getBlockReceipts(null, n, hashesByBlockNumber[n], config.CHAIN_ID))
            )))
        }

        return receipts.flat().filter(r => !!r).map(receipt => ({
            transactionHash: receipt.transactionHash,
            contractAddress: normalizeEthAddress(receipt.contractAddress),
            status: hexToNumber(receipt.status),
            root: normalize32ByteHash(receipt.root),
            gasUsed: hexToNumberString(receipt.gasUsed),
            cumulativeGasUsed: hexToNumberString(receipt.cumulativeGasUsed),
            effectiveGasPrice: hexToNumberString(receipt.effectiveGasPrice),
        }))
    }

    async _saveBatchResults(batchResults: StringKeyMap[]) {
        logger.info(`Updating ${batchResults.length} transactions...`)
        const schema = schemaForChainId[config.CHAIN_ID]
        const tempTableName = `${schema}_receipts_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const receipt of batchResults) {
            const {
                transactionHash,
                contractAddress,
                status,
                root,
                gasUsed,
                cumulativeGasUsed,
                effectiveGasPrice,
            } = receipt
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`)
            insertBindings.push(...[transactionHash, contractAddress, status, root, gasUsed, cumulativeGasUsed, effectiveGasPrice])
            i += 7
        }
        
        let error
        const client = await ChainTables.getConnection(schema)
        try {
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (transaction_hash varchar primary key, contract_address character varying, status int2, root varchar, gas_used varchar, cumulative_gas_used varchar, effective_gas_price varchar) ON COMMIT DROP`
            )
            await client.query(`INSERT INTO ${tempTableName} (transaction_hash, contract_address, status, root, gas_used, cumulative_gas_used, effective_gas_price) VALUES ${insertPlaceholders.join(', ')}`, insertBindings)
            await client.query(
                `UPDATE ${schema}.transactions SET contract_address = ${tempTableName}.contract_address, status = ${tempTableName}.status, root = ${tempTableName}.root, gas_used = ${tempTableName}.gas_used, cumulative_gas_used = ${tempTableName}.cumulative_gas_used, effective_gas_price = ${tempTableName}.effective_gas_price FROM ${tempTableName} WHERE ${schema}.transactions.hash = ${tempTableName}.transaction_hash`
            )
            await client.query('COMMIT')
        } catch (err) {
            error = err
            await client.query('ROLLBACK')
        }
        client.release()
        if (error) {
            throw error
        }
    }
}

export function getResolveReceiptsWorker(): ResolveReceiptsWorker {
    return new ResolveReceiptsWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
    )
}