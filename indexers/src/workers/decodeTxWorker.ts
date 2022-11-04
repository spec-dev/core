import config from '../config'
import {
    logger,
    range,
    SharedTables,
    Abi,
    AbiItem,
    In,
    EthTransaction,
    StringKeyMap,
    getAbis,
    getFunctionSignatures,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'

const web3 = new Web3()

const transactionsRepo = () => SharedTables.getRepository(EthTransaction)

class DecodeTxWorker {
    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    txsToSave: EthTransaction[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.txsToSave = []

        // Create connection pool.
        this.pool = new Pool({
            host : config.SHARED_TABLES_DB_HOST,
            port : config.SHARED_TABLES_DB_PORT,
            user : config.SHARED_TABLES_DB_USERNAME,
            password : config.SHARED_TABLES_DB_PASSWORD,
            database : config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            idleTimeoutMillis: 0,
            query_timeout: 0,
            connectionTimeoutMillis: 0,
            statement_timeout: 0,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const group = range(start, end)
            await this._indexGroup(group)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.txsToSave.length) {
            await this._updateTransactions(this.txsToSave)
            this.txsToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get transactions for this block range.
        let transactions = await this._getTransactionsForBlocks(numbers)
        const numTxsForBlockRange = transactions.length
        if (!numTxsForBlockRange) return

        // Get all abis for addresses needed to decode transactions.
        const txToAddresses = transactions.map(t => t.to).filter(v => !!v)
        const sigs = transactions.filter(tx => !!tx.input).map(tx => tx.input.slice(0, 10))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(Array.from(new Set(txToAddresses))),
            getFunctionSignatures(Array.from(new Set(sigs))),
        ])
        if (!Object.keys(abis).length && !Object.keys(functionSignatures).length) return

        // Decode transactions.
        transactions = this._decodeTransactions(
            transactions,
            abis,
            functionSignatures,
        ).filter(tx => !!tx.functionName)
        if (!transactions.length) return

        const numDecodedTransactions = transactions.length
        const pct = ((numDecodedTransactions / numTxsForBlockRange) * 100).toFixed(2)
        logger.info(`    Decoded ${numDecodedTransactions} / ${numTxsForBlockRange} (${pct}%)\n`)

        this.txsToSave.push(...transactions)

        if (this.txsToSave.length >= 10000) {
            await this._updateTransactions(this.txsToSave)
            this.txsToSave = []
        }
    }

    async _updateTransactions(transactions: EthTransaction[]) {
        logger.info(`Saving ${transactions.length} decoded transactions...`)
        const tempTableName = `tx_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const tx of transactions) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
            const functionArgs = tx.functionArgs === null ? null : JSON.stringify(tx.functionArgs)
            insertBindings.push(...[tx.hash, tx.functionName, functionArgs])
            i += 3
        }
        const insertQuery = `INSERT INTO ${tempTableName} (hash, function_name, function_args) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (hash character varying(70) primary key, function_name character varying, function_args json) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE ethereum.transactions SET function_name = ${tempTableName}.function_name, function_args = ${tempTableName}.function_args FROM ${tempTableName} WHERE ethereum.transactions.hash = ${tempTableName}.hash`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            throw e
        } finally {
            client.release()
        }
    }

    _decodeTransactions(
        transactions: EthTransaction[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): EthTransaction[] {
        const finalTxs = []
        for (let tx of transactions) {
            if (!tx.to || !abis.hasOwnProperty(tx.to) || !tx.input) {
                finalTxs.push(tx)
                continue
            }
            tx = this._decodeTransaction(tx, abis[tx.to], functionSignatures)
            finalTxs.push(tx)
        }
        return finalTxs
    }

    _decodeTransaction(
        tx: EthTransaction,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): EthTransaction {
        const sig = tx.input?.slice(0, 10) || ''
        const argData = tx.input?.slice(10) || ''
        if (!sig) return tx

        const abiItem = abi.find(item => item.signature === sig) || functionSignatures[sig] 
        if (!abiItem) return tx

        if (!abiItem.inputs?.length) {
            tx.functionName = abiItem.name
            tx.functionArgs = []
            return tx
        }

        let functionArgs
        try {
            functionArgs = this._decodeArgs(abiItem.inputs, argData, tx.hash)
        } catch (err) {
            logger.error(err.message)
        }
        if (!functionArgs) return tx

        tx.functionName = abiItem.name
        tx.functionArgs = functionArgs

        return tx
    }

    _decodeArgs(inputs: StringKeyMap[], argData: string, hash: string): StringKeyMap[] | null {
        let functionArgs
        try {
            const inputsWithNames = ensureNamesExistOnAbiInputs(inputs)
            const values = web3.eth.abi.decodeParameters(inputsWithNames, `0x${argData}`)
            functionArgs = groupAbiInputsWithValues(inputsWithNames, values)
        } catch (err) {
            if (err.reason?.includes('out-of-bounds') && 
                err.code === 'BUFFER_OVERRUN' && 
                argData.length % 64 === 0 &&
                inputs.length > (argData.length / 64)
            ) {
                const numInputsToUse = argData.length / 64
                return this._decodeArgs(inputs.slice(0, numInputsToUse), argData, hash)
            }
            logger.error(`Decoding error (${hash}): ${err.message || err}`)
            return null
        }
        return functionArgs || []
    }

    async _getTransactionsForBlocks(numbers: number[]): Promise<EthTransaction[]> {
        try {
            return (
                (await transactionsRepo().find({
                    select: { hash: true, to: true, input: true },
                    where: {
                        blockNumber: In(numbers),
                    }
                })) || []
            ).filter(tx => !tx.functionName)
        } catch (err) {
            logger.error(`Error getting transactions: ${err}`)
            return []
        }
    }
}

export function getDecodeTxWorker(): DecodeTxWorker {
    return new DecodeTxWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}