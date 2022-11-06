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
    Not,
    toChunks,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'

const web3 = new Web3()

const transactionsRepo = () => SharedTables.getRepository(EthTransaction)

const redecode = [
    15527202,
    15527633,
    15534207,
    15534996,
    15539509,
    15574339,
    15619985,
    15619986,
    15619987,
    15619988,
    15619989,
    15619990,
    15639956,
    15639957,
    15639958,
    15639959,
    15639960,
    15639961,
    15639962,
    15639963,
    15639964,
    15639965,
    15639966,
    15639967,
    15639968,
    15639969,
    15639970,
    15639971,
    15639972,
    15639973,
    15639974,
    15639975,
    15639976,
    15639977,
    15639978,
    15639979,
    15639980,
    15639981,
    15639982,
    15639983,
    15639984,
    15639985,
    15639986,
    15639987,
    15639988,
    15665975,
    15665976,
    15665977,
    15665978,
    15665979,
    15665980,
    15666021,
    15666022,
    15666023,
    15668545,
    15668602,
    15668603,
    15668604,
    15668605,
    15668606,
    15668607,
    15668608,
    15668609,
    15668610,
    15668611,
    15668612,
    15668613,
    15668614,
    15668615,
    15668616,
    15668617,
    15668618,
    15668619,
    15668620,
    15668621,
    15668622,
    15668623,
    15668624,
    15668625,
    15668626,
    15668627,
    15668628,
    15668629,
    15668630,
    15668631,
    15668632,
    15668633,
    15668634,
    15668635,
    15668636,
    15668637,
    15668638,
    15668639,
    15668640,
    15668641,
    15668642,
    15668643,
    15668644,
    15668645,
    15668646,
    15668647,
    15668648,
    15668649,
    15668650,
    15668651,
    15668652,
    15668672,
    15668675,
    15668676,
    15668677,
    15668678,
    15668679,
    15668680,
    15668681,
    15668689,
    15668690,
    15668691,
    15668692,
    15668693,
    15668694,
    15668695,
    15668696,
    15668697,
    15668698,
    15668699,
    15668700,
    15668928,
    15668929,
    15668930,
    15668931,
    15668932,
    15668933,
    15668934,
    15668935,
    15668936,
    15668937,
    15668938,
    15668939,
    15668940,
    15668941,
    15668942,
    15668943,
    15668944,
    15668945,
    15668946,
    15668947,
    15762597,
    15796560,
    15796561,
    15892665,
]

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
        // while (this.cursor < this.to) {
        //     const start = this.cursor
        //     const end = Math.min(this.cursor + this.groupSize - 1, this.to)
        //     const group = range(start, end)
        //     await this._indexGroup(group)
        //     this.cursor = this.cursor + this.groupSize
        // }
        // if (this.txsToSave.length) {
        //     await this._updateTransactions(this.txsToSave)
        //     this.txsToSave = []
        // }
        const chunks = toChunks(redecode, this.groupSize)
        for (const chunk of chunks) {
            await this._indexGroup(chunk)
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

        if (this.txsToSave.length >= 5000) {
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
            let functionArgs
            try {
                functionArgs = tx.functionArgs === null ? null : JSON.stringify(tx.functionArgs)
            } catch (e) {
                continue
            }
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
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
            logger.error(e)
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
        // try {
        //     return (
        //         (await transactionsRepo().find({
        //             select: { hash: true, to: true, input: true },
        //             where: {
        //                 blockNumber: In(numbers),
        //             }
        //         })) || []
        //     )
        // } catch (err) {
        //     logger.error(`Error getting transactions: ${err}`)
        //     return []
        // }
        let transactionsToReprocess = []
        try {
            transactionsToReprocess = (
                (await transactionsRepo().find({
                    select: { hash: true, to: true, input: true, functionName: true, functionArgs: true },
                    where: {
                        blockNumber: In(numbers),
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting transactions: ${err}`)
            return []
        }
        return transactionsToReprocess.filter(tx => {
            const functionArgs = tx.functionArgs
            if (!functionArgs || !functionArgs.length) return false
            return JSON.stringify(functionArgs).match(/"type":"(.*)\[[0-9]+\]"/) !== null
        })
    }
}

export function getDecodeTxWorker(): DecodeTxWorker {
    return new DecodeTxWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}