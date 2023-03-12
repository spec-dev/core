import config from '../config'
import {
    logger,
    NewReportedHead,
    IndexedBlock,
    StringKeyMap,
    PolygonBlock,
    PolygonLog,
    PolygonTransaction,
    PolygonTrace,
    PolygonContract,
    range,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    fullPolygonTraceUpsertConfig,
    fullPolygonContractUpsertConfig,
    SharedTables,
    unique,
    uniqueByKeys,
    toChunks,
    In,
    numberToHex,
    getAbis,
    Abi,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    AbiItem,
    getFunctionSignatures,
} from '../../../shared'
import { exit } from 'process'
import resolveBlockTraces from '../indexers/polygon/services/resolveBlockTraces'
import getContracts from '../indexers/polygon/services/getContracts'
import Web3 from 'web3'

const web3 = new Web3()

const blocksRepo = () => SharedTables.getRepository(PolygonBlock)

class PolygonRangeWorker {

    from: number

    to: number | null

    groupSize: number

    saveBatchMultiple: number

    cursor: number

    upsertConstraints: StringKeyMap

    batchResults: any[] = []

    batchBlockNumbersIndexed: number[] = []

    batchExistingBlocksMap: { [key: number]: IndexedBlock } = {}

    chunkSize: number = 2000

    saveBatchIndex: number = 0

    constructor(from: number, to?: number | null, groupSize?: number, saveBatchMultiple?: number) {
        this.from = from
        this.to = to
        this.cursor = from
        this.groupSize = groupSize || 1
        this.saveBatchMultiple = saveBatchMultiple || 1
        this.upsertConstraints = {}
    }

    async run() {
        while (this.cursor < this.to) {
            const start = this.cursor
            const end = Math.min(this.cursor + this.groupSize - 1, this.to)
            await this._indexBlockGroup(start, end)
            this.cursor = this.cursor + this.groupSize
        }
        if (this.batchResults.length) {
            await this._saveBatches(this.batchResults)
        }
        logger.info('DONE')
        exit()
    }

    async _indexBlockGroup(start: number, end: number) {
        logger.info(`Indexing ${start} --> ${end}...`)
        const blockNumbers = range(start, end)

        // const missingBlockNumbers = (await SharedTables.query(
        //     `SELECT s.id AS missing FROM generate_series(${start}, ${end}) s(id) WHERE NOT EXISTS (SELECT 1 FROM polygon.blocks WHERE number = s.id)`
        // )).map(r => r.missing)
        // if (!missingBlockNumbers.length) return

        const blocks = await this._getBlocks(blockNumbers)

        const indexResultPromises = []
        for (const block of blocks) {
            indexResultPromises.push(this._indexBlock(block))
        }
        const indexResults = await Promise.all(indexResultPromises)

        this.batchResults.push(...indexResults)
        this.saveBatchIndex++
        if (this.saveBatchIndex === this.saveBatchMultiple) {
            this.saveBatchIndex = 0
            const batchResults = [...this.batchResults]
            await this._saveBatches(batchResults)
            this.batchResults = []
        }
    }

    async _getBlocks(numbers: number[]): Promise<PolygonBlock[]> {
        try {
            return (
                (await blocksRepo().find({
                    select: { hash: true, number: true, timestamp: true },
                    where: { number: In(numbers) }
                })) || []
            )
        } catch (err) {
            logger.error(`Error getting logs: ${err}`)
            return []
        }
    }

    async _indexBlock(block: PolygonBlock): Promise<StringKeyMap | null> {
        let traces = await this._getTraces(block.number, block.hash)
        for (const trace of traces) {
            trace.blockTimestamp = block.timestamp
        }

        const traceToAddresses = traces.map(t => t.to).filter(v => !!v)
        const sigs = unique(traces.filter(trace => !!trace.input).map(trace => trace.input.slice(0, 10)))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(unique(traceToAddresses), config.CHAIN_ID),
            getFunctionSignatures(sigs),
        ])
        const numAbis = Object.keys(abis).length
        const numFunctionSigs = Object.keys(functionSignatures).length

        traces = traces.length && (numAbis || numFunctionSigs) 
            ? this._decodeTraces(traces, abis, functionSignatures) 
            : traces
            
        // Get any new contracts deployed this block.
        const contracts = getContracts(traces)
        
        return {
            traces,
            contracts,
        }
    }

    async _getTraces(blockNumber: number, blockHash: string, ): Promise<PolygonTrace[]> {
        try {
            return resolveBlockTraces(numberToHex(blockNumber), blockNumber, blockHash, config.CHAIN_ID)
        } catch (err) {
            throw err
        }
    }

    _decodeTraces(
        traces: PolygonTrace[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): PolygonTrace[] {
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
        trace: PolygonTrace,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): PolygonTrace {
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
                functionArgs = this._decodeFunctionArgs(abiItem.inputs, inputData)
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
                functionOutputs = this._decodeFunctionArgs(abiItem.outputs, trace.output.slice(2))
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

    _decodeFunctionArgs(inputs: StringKeyMap[], inputData: string): StringKeyMap[] | null {
        let functionArgs
        try {
            const inputsWithNames = ensureNamesExistOnAbiInputs(inputs)
            const values = web3.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
            functionArgs = groupAbiInputsWithValues(inputsWithNames, values)
        } catch (err) {
            if (err.reason?.includes('out-of-bounds') && 
                err.code === 'BUFFER_OVERRUN' && 
                inputData.length % 64 === 0 &&
                inputs.length > (inputData.length / 64)
            ) {
                const numInputsToUse = inputData.length / 64
                return this._decodeFunctionArgs(inputs.slice(0, numInputsToUse), inputData)
            }
            return null
        }
        return functionArgs || []
    }

    _atNumber(blockNumber: number): NewReportedHead {
        return {
            id: 0,
            chainId: config.CHAIN_ID,
            blockNumber,
            blockHash: null,
            replace: false,
            force: true,
        }
    }

    async _saveBatches(batchResults: any[]) {
        try {
            await this._saveBatchResults(batchResults)
        } catch (err) {
            logger.error(`Error saving batch: ${err}`)
        }
    }

    async _saveBatchResults(results: any[]) {
        let blocks = []
        let transactions = []
        let logs = []
        let traces = []
        let contracts = []

        for (const result of results) {
            if (!result) continue
            // blocks.push({ ...result.block, timestamp: () => result.pgBlockTimestamp })
            // transactions.push(
            //     ...result.transactions.map((t) => ({
            //         ...t,
            //         blockTimestamp: () => result.pgBlockTimestamp,
            //     }))
            // )
            // logs.push(
            //     ...result.logs.map((l) => ({ 
            //         ...l, 
            //         blockTimestamp: () => result.pgBlockTimestamp 
            //     }))
            // )
            // traces.push(
            //     ...result.traces.map((t) => ({
            //         ...t,
            //         blockTimestamp: () => result.pgBlockTimestamp,
            //     }))
            // )
            // contracts.push(
            //     ...result.contracts.map((c) => ({
            //         ...c,
            //         blockTimestamp: () => result.pgBlockTimestamp,
            //     }))
            // )
            traces.push(...result.traces)
            contracts.push(...result.contracts)
        }

        // if (!this.upsertConstraints.block && blocks.length) {
        //     this.upsertConstraints.block = fullPolygonBlockUpsertConfig(blocks[0])
        // }
        // if (!this.upsertConstraints.transaction && transactions.length) {
        //     this.upsertConstraints.transaction = fullPolygonTransactionUpsertConfig(transactions[0])
        // }
        // if (!this.upsertConstraints.log && logs.length) {
        //     this.upsertConstraints.log = fullPolygonLogUpsertConfig(logs[0])
        // }
        if (!this.upsertConstraints.trace && traces.length) {
            this.upsertConstraints.trace = fullPolygonTraceUpsertConfig(traces[0])
        }
        if (!this.upsertConstraints.contract && contracts.length) {
            this.upsertConstraints.contract = fullPolygonContractUpsertConfig(contracts[0])
        }

        // blocks = this.upsertConstraints.block
        //     ? uniqueByKeys(blocks, this.upsertConstraints.block[1])
        //     : blocks

        // transactions = this.upsertConstraints.transaction
        //     ? uniqueByKeys(transactions, this.upsertConstraints.transaction[1])
        //     : transactions

        // logs = this.upsertConstraints.log ? uniqueByKeys(logs, ['logIndex', 'transactionHash']) : logs

        traces = this.upsertConstraints.trace
            ? uniqueByKeys(traces, this.upsertConstraints.trace[1])
            : traces

        contracts = this.upsertConstraints.contract
            ? uniqueByKeys(contracts, this.upsertConstraints.contract[1])
            : contracts

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                // this._upsertBlocks(blocks, tx),
                // this._upsertTransactions(transactions, tx),
                // this._upsertLogs(logs, tx),
                this._upsertTraces(traces, tx),
                this._upsertContracts(contracts, tx),
            ])
        })
    }

    async _upsertBlocks(blocks: StringKeyMap[], tx: any) {
        if (!blocks.length) return
        const [updateBlockCols, conflictBlockCols] = this.upsertConstraints.block
        await tx
            .createQueryBuilder()
            .insert()
            .into(PolygonBlock)
            .values(blocks)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: StringKeyMap[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = this.upsertConstraints.transaction
        await Promise.all(
            toChunks(transactions, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonTransaction)
                    .values(chunk)
                    .orUpdate(updateTransactionCols, conflictTransactionCols)
                    .execute()
            })
        )
    }

    async _upsertLogs(logs: StringKeyMap[], tx: any): Promise<StringKeyMap[]> {
        if (!logs.length) return []
        const [updateLogCols, conflictLogCols] = this.upsertConstraints.log
        return (
            await Promise.all(
                toChunks(logs, this.chunkSize).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(PolygonLog)
                        .values(chunk)
                        .orUpdate(updateLogCols, conflictLogCols)
                        .returning('*')
                        .execute()
                })
            )
        ).map(result => result.generatedMaps).flat()
    }

    async _upsertTraces(traces: StringKeyMap[], tx: any) {
        if (!traces.length) return
        logger.info(`Saving ${traces.length} traces...`)
        const [updateTraceCols, conflictTraceCols] = this.upsertConstraints.trace
        await Promise.all(
            toChunks(traces, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonTrace)
                    .values(chunk)
                    .orUpdate(updateTraceCols, conflictTraceCols)
                    .execute()
            })
        )
    }

    async _upsertContracts(contracts: StringKeyMap[], tx: any) {
        if (!contracts.length) return
        logger.info(`Saving ${contracts.length} contracts...`)
        const [updateContractCols, conflictContractCols] = this.upsertConstraints.contract
        await Promise.all(
            toChunks(contracts, this.chunkSize).map((chunk) => {
                return tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonContract)
                    .values(chunk)
                    .orUpdate(updateContractCols, conflictContractCols)
                    .execute()
            })
        )
    }
}

export function getPolygonRangeWorker(): PolygonRangeWorker {
    return new PolygonRangeWorker(
        config.FROM,
        config.TO,
        config.RANGE_GROUP_SIZE,
        config.SAVE_BATCH_MULTIPLE
    )
}