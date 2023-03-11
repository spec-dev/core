import config from '../config'
import {
    logger,
    range,
    SharedTables,
    Abi,
    AbiItem,
    In,
    StringKeyMap,
    getAbis,
    getFunctionSignatures,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    EthTrace,
} from '../../../shared'
import { exit } from 'process'
import Web3 from 'web3'
import { Pool } from 'pg'
import short from 'short-uuid'

const web3 = new Web3()

const tracesRepo = () => SharedTables.getRepository(EthTrace)

export class DecodeTraceWorker {
    from: number 

    to: number | null

    groupSize: number

    cursor: number

    pool: Pool

    tracesToSave: EthTrace[]

    constructor(from: number, to?: number | null, groupSize?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.tracesToSave = []

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
        if (this.tracesToSave.length) {
            await this._updateTraces(this.tracesToSave)
            this.tracesToSave = []
        }
        logger.info('DONE')
        exit()
    }

    async _indexGroup(numbers: number[]) {
        logger.info(`Indexing ${numbers[0]} --> ${numbers[numbers.length - 1]}...`)

        // Get traces for this block range.
        let traces = await this._getTracesForBlocks(numbers)
        const numTracesForBlockRange = traces.length
        if (!numTracesForBlockRange) return

        // Get all abis for addresses needed to decode traces.
        const traceToAddresses = traces.map(t => t.to).filter(v => !!v)
        const sigs = traces.filter(trace => !!trace.input).map(trace => trace.input.slice(0, 10))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(Array.from(new Set(traceToAddresses)), config.CHAIN_ID),
            getFunctionSignatures(Array.from(new Set(sigs)), config.CHAIN_ID),
        ])
        if (!Object.keys(abis).length && !Object.keys(functionSignatures).length) return

        // Decode traces.
        traces = this._decodeTraces(
            traces,
            abis,
            functionSignatures,
        ).filter(trace => !!trace.functionName)
        if (!traces.length) return

        const numDecodedTraces = traces.length
        const pct = ((numDecodedTraces / numTracesForBlockRange) * 100).toFixed(2)
        logger.info(`    Decoded ${numDecodedTraces} / ${numTracesForBlockRange} (${pct}%)\n`)

        this.tracesToSave.push(...traces)

        if (this.tracesToSave.length >= 3000) {
            await this._updateTraces(this.tracesToSave)
            this.tracesToSave = []
        }
    }

    async _updateTraces(traces: EthTrace[]) {
        logger.info(`Saving ${traces.length} decoded traces...`)
        const tempTableName = `trace_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const trace of traces) {
            let functionArgs
            try {
                functionArgs = trace.functionArgs === null ? null : JSON.stringify(trace.functionArgs)
            } catch (e) {
                continue
            }
            let functionOutputs
            try {
                functionOutputs = trace.functionOutputs === null ? null : JSON.stringify(trace.functionOutputs)
            } catch (e) {
                continue
            }
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`)
            insertBindings.push(...[trace.id, trace.functionName, functionArgs, functionOutputs])
            i += 4
        }
        const insertQuery = `INSERT INTO ${tempTableName} (id, function_name, function_args, function_outputs) VALUES ${insertPlaceholders.join(', ')}`

        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id character varying primary key, function_name character varying, function_args json, function_outputs json) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(insertQuery, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE ethereum.traces SET function_name = ${tempTableName}.function_name, function_args = ${tempTableName}.function_args, function_outputs = ${tempTableName}.function_outputs FROM ${tempTableName} WHERE ethereum.traces.id = ${tempTableName}.id`
            )
            await client.query('COMMIT')
        } catch (e) {
            await client.query('ROLLBACK')
            logger.error(e)
        } finally {
            client.release()
        }
    }

    _decodeTraces(
        traces: EthTrace[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): EthTrace[] {
        const finalTraces = []
        for (let trace of traces) {
            if (!trace.to || !abis.hasOwnProperty(trace.to) || !trace.input) {
                finalTraces.push(trace)
                continue
            }
            trace = this._decodeTrace(trace, abis[trace.to], functionSignatures)
            finalTraces.push(trace)
        }
        return finalTraces
    }

    _decodeTrace(
        trace: EthTrace,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): EthTrace {
        const inputSig = trace.input?.slice(0, 10) || ''
        const inputData = trace.input?.slice(10) || ''
        if (!inputSig) return trace

        const abiItem = abi.find(item => item.signature === inputSig) || functionSignatures[inputSig] 
        if (!abiItem) return trace

        trace.functionName = abiItem.name
        trace.functionArgs = []
        trace.functionOutputs = []

        // Decode function inputs.
        if (abiItem.inputs?.length) {
            let functionArgs
            try {
                functionArgs = this._decodeArgs(abiItem.inputs, inputData)
            } catch (err) {
                logger.error(err.message)
            }

            // Ensure args are stringifyable.
            try {
                functionArgs && JSON.stringify(functionArgs)
            } catch (err) {
                functionArgs = null
                logger.warn(`Trace function args not stringifyable (id=${trace.id})`)
            }

            if (functionArgs) {
                trace.functionArgs = functionArgs
            }
        }

        // Decode function outputs.
        if (abiItem.outputs?.length && !!trace.output && trace.output.length > 2) { // 0x
            let functionOutputs
            try {
                functionOutputs = this._decodeArgs(abiItem.outputs, trace.output.slice(2))
            } catch (err) {
                logger.error(err.message)
            }

            // Ensure outputs are stringifyable.
            try {
                functionOutputs && JSON.stringify(functionOutputs)
            } catch (err) {
                functionOutputs = null
                logger.warn(`Trace function outputs not stringifyable (id=${trace.id})`)
            }

            if (functionOutputs) {
                trace.functionOutputs = functionOutputs
            }
        }

        return trace
    }

    _decodeArgs(inputs: StringKeyMap[], argData: string): StringKeyMap[] | null {
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
                return this._decodeArgs(inputs.slice(0, numInputsToUse), argData)
            }
            return null
        }
        return functionArgs || []
    }

    async _getTracesForBlocks(numbers: number[]): Promise<EthTrace[]> {
        try {
            return (
                (await tracesRepo().find({
                    select: { id: true, to: true, input: true, output: true },
                    where: {
                        blockNumber: In(numbers),
                    }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting traces: ${err}`)
            return []
        }
    }
}

export function getDecodeTraceWorker(): DecodeTraceWorker {
    return new DecodeTraceWorker(config.FROM, config.TO, config.RANGE_GROUP_SIZE)
}