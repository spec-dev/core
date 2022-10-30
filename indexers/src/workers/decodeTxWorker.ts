import config from '../config'
import {
    logger,
    range,
    StringKeyMap,
    SharedTables,
    Abi,
    AbiItem,
    In,
    EthTransaction,
    getAbis,
    getFunctionSignatures,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import short from 'short-uuid'

const web3 = new Web3()

const transactionsRepo = () => SharedTables.getRepository(EthTransaction)

class DecodeTxWorker {
    from: number 

    to: number | null

    groupSize: number

    cursor: number

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            const group = range(start, end)
            await this._indexGroup(group)
            this.cursor = this.cursor + this.groupSize
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get transactions for this block range.
        let transactions = await this._getTransactionsForBlocks(numbers)
        if (!transactions.length) return

        // Get all abis for addresses needed to decode transactions.
        const txToAddresses = transactions.map(t => t.to)
        const sigs = transactions.filter(tx => !!tx.input).map(tx => tx.input.slice(0, 10))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(Array.from(new Set(txToAddresses))),
            getFunctionSignatures(Array.from(new Set(sigs))),
        ])

        // Decode transactions and logs.
        transactions = this._decodeTransactions(transactions, abis, functionSignatures)

        // TODO: Bulk update transactions
        this._updateTransactions(transactions)
    }

    async _updateTransactions(transactions: EthTransaction[]) {
        const tempTableName = `tx_${short.generate()}`

        // // Merge primary keys and updates into individual records.
        // const tempRecords = transactions.map(tx => ({ hash: tx.hash,  }))
        // for (let i = 0; i < this.op.where.length; i++) {
        //     tempRecords.push({ ...this.op.where[i], ...this.op.data[i] })
        // }

        // // Build the bulk insert query for a temp table.
        // const valueColNames = Object.keys(tempRecords[0])
        // const valuePlaceholders = tempRecords
        //     .map((r) => `(${valueColNames.map((_) => '?').join(', ')})`)
        //     .join(', ')
        // const valueBindings = tempRecords
        //     .map((r) => valueColNames.map((colName) => r[colName]))
        //     .flat()
        // const insertQuery = db
        //     .raw(
        //         `INSERT INTO ${tempTableName} (hash, function_name, function_args) VALUES ${valuePlaceholders}
        //             ', '
        //         )}) VALUES ${valuePlaceholders}`,
        //         valueBindings
        //     )
        //     .toSQL()
        //     .toNative()

        // const client = await pool.connect()

        // try {
        //     // Create temp table and insert updates + primary key data.
        //     await client.query('BEGIN')
        //     await client.query(
        //         `CREATE TEMP TABLE ${tempTableName} (hash character varying(70) primary key, function_name character varying, function_args json) ON COMMIT DROP`
        //     )

        //     // Bulk insert the updated records to the temp table.
        //     await client.query(, insertQuery.bindings)

        //     // Merge the temp table updates into the target table ("bulk update").
        //     await client.query(
        //         `UPDATE ethereum.transactions SET function_name = ${tempTableName}.function_name, function_args = ${tempTableName}.function_args FROM ${tempTableName} WHERE ethereum.transactions.hash = ${tempTableName}.hash`
        //     )
        //     await client.query('COMMIT')
        // } catch (e) {
        //     await client.query('ROLLBACK')
        //     throw e
        // } finally {
        //     client.release()
        // }
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
            try {
                tx = this._decodeTransaction(tx, abis[tx.to], functionSignatures)
            } catch (err) {
                logger.error(`Error decoding transaction ${tx.hash}: ${err}`)
            }
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
        
        const argNames = []
        const argTypes = []
        for (const input of abiItem.inputs || []) {
            input.name && argNames.push(input.name)
            argTypes.push(input.type)
        }

        const decodedArgs = web3.eth.abi.decodeParameters(argTypes, `0x${argData}`)
        
        const argValues = []
        for (let i = 0; i < decodedArgs.__length__; i++) {
            const stringIndex = i.toString()
            if (!decodedArgs.hasOwnProperty(stringIndex)) continue
            argValues.push(decodedArgs[stringIndex])
        }
        if (argValues.length !== argTypes.length) return tx

        const includeArgNames = argNames.length === argTypes.length
        const functionArgs = []
        for (let j = 0; j < argValues.length; j++) {
            const entry: StringKeyMap = {
                type: argTypes[j],
                value: argValues[j],
            }
            if (includeArgNames) {
                entry.name = argNames[j]
            }
            functionArgs.push(entry)
        }

        tx.functionName = abiItem.name
        tx.functionArgs = functionArgs
        
        return tx
    }

    async _getTransactionsForBlocks(numbers: number[]): Promise<EthTransaction[]> {
        try {
            return (
                (await transactionsRepo().find({
                    select: { hash: true, to: true, input: true },
                    where: {
                        blockNumber: In(numbers)
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting transactions: ${err}`)
            return []
        }
    }
}

export function getDecodeTxWorker(): DecodeTxWorker {
    return new DecodeTxWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}