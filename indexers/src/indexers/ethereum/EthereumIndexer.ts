import AbstractIndexer from '../AbstractIndexer'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import getContracts from './services/getContracts'
import initLatestInteractions from './services/initLatestInteractions'
import { publishEventSpecs } from '../../events/relay'
import { NewInteractions, NewTransactions } from '../../events'
import config from '../../config'
import Web3 from 'web3'
import { ExternalEthTransaction, ExternalEthReceipt, ExternalEthBlock } from './types'
import {
    sleep,
    EthBlock,
    EthTrace,
    EthLog,
    EthContract,
    NewReportedHead,
    SharedTables,
    EthTransaction,
    EthTransactionStatus,
    fullBlockUpsertConfig,
    fullContractUpsertConfig,
    fullLogUpsertConfig,
    fullTraceUpsertConfig,
    fullTransactionUpsertConfig,
    fullLatestInteractionUpsertConfig,
    StringKeyMap,
    EthLatestInteraction,
    toChunks,
    enqueueDelayedJob,
    getMissingAbiAddresses,
    getAbis,
    getFunctionSignatures,
    Abi,
    AbiItem,
    In,
    ensureNamesExistOnAbiInputs,
    CoreDB,
    ContractInstance,
    groupAbiInputsWithValues,
    formatAbiValueWithType,
    schemas,
} from '../../../../shared'

const web3js = new Web3()

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

class EthereumIndexer extends AbstractIndexer {
    
    web3: AlchemyWeb3

    block: EthBlock = null

    transactions: EthTransaction[] = []

    logs: EthLog[] = []

    traces: EthTrace[] = []

    contracts: EthContract[] = []

    latestInteractions: EthLatestInteraction[] = []

    successfulLogs: EthLog[] = []

    constructor(head: NewReportedHead, web3?: AlchemyWeb3) {
        super(head)
        this.web3 = web3 || createAlchemyWeb3(config.ALCHEMY_REST_URL)
    }

    async perform(): Promise<StringKeyMap | void> {
        super.perform()
        if (!config.IS_RANGE_MODE && !this.head.replace && (await this._blockAlreadyExists(schemas.ETHEREUM))) {
            return
        }

        // Get blocks (+transactions), receipts (+logs), and traces.
        const blockPromise = this._getBlockWithTransactions()
        const receiptsPromise = this._getBlockReceiptsWithLogs()
        const tracesPromise = this._getTraces()

        // Wait for block and receipt promises to resolve (we need them for transactions and logs, respectively).
        let [blockResult, receipts] = await Promise.all([blockPromise, receiptsPromise])
        const [externalBlock, block] = blockResult
        this.resolvedBlockHash = block.hash
        this.blockUnixTimestamp = externalBlock.timestamp

        // Quick uncle check.
        if (await this._wasUncled()) {
            this._warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Ensure there's not a block hash mismatch between block and receipts.
        // This can happen when fetching by block number around chain re-orgs.
        if (receipts.length && receipts[0].blockHash !== block.hash) {
            this._warn(
                `Hash mismatch with receipts for block ${block.hash} -- refetching until equivalent.`
            )
            receipts = await this._waitAndRefetchReceipts(block.hash)
        }

        // Convert external block transactions into our custom external eth transaction type.
        const externalTransactions = externalBlock.transactions.map(
            (t) => t as unknown as ExternalEthTransaction
        )

        // If transactions exist, but receipts don't, try one more time to get them before erroring out.
        if (externalTransactions.length && !receipts.length) {
            this._warn('Transactions exist but no receipts were found -- trying again.')
            receipts = await this._getBlockReceiptsWithLogs()
            if (!receipts.length) {
                throw `Failed to fetch receipts when transactions (count=${externalTransactions.length}) clearly exist.`
            }
        } else if (!externalTransactions.length) {
            this._info('No transactions this block.')
        }

        // Quick uncle check.
        if (await this._wasUncled()) {
            this._warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Initialize our internal models for both transactions and logs.
        let transactions = externalTransactions.length
            ? initTransactions(block, externalTransactions, receipts)
            : []
        let logs = receipts?.length ? initLogs(block, receipts) : []

        // Get all abis for addresses needed to decode both transactions and logs.
        const txToAddresses = transactions.map(t => t.to).filter(v => !!v)
        const logAddresses = logs.map(l => l.address).filter(v => !!v)
        const sigs = transactions.filter(tx => !!tx.input).map(tx => tx.input.slice(0, 10))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(
                Array.from(new Set([ ...txToAddresses, ...logAddresses ])),
            ),
            getFunctionSignatures(
                Array.from(new Set(sigs)),
            ),
        ])
        const numAbis = Object.keys(abis).length
        const numFunctionSigs = Object.keys(functionSignatures).length

        // Decode transactions and logs.
        transactions = transactions.length && (numAbis || numFunctionSigs) 
            ? this._decodeTransactions(transactions, abis, functionSignatures) 
            : transactions
        logs = logs.length && numAbis ? this._decodeLogs(logs, abis) : logs
        
        // Wait for traces to resolve and ensure there's not block hash mismatch.
        let traces = await tracesPromise
        if (traces.length && traces[0].blockHash !== block.hash) {
            this._warn(
                `Hash mismatch with traces for block ${block.hash} -- refetching until equivalent.`
            )
            traces = await this._waitAndRefetchTraces(block.hash)
        }
        traces = this._enrichTraces(traces, block)

        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts || [], traces)

        // Get any new contracts deployed this block.
        const [contracts, _] = getContracts(traces)
        contracts.length && this._info(`Got ${contracts.length} new contracts.`)

        // Format transactions & traces as latest interactions between addresses.
        const latestInteractions = await initLatestInteractions(transactions, traces, contracts)

        // One more uncle check before taking action.
        if (await this._wasUncled()) {
            this._warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Return early with the indexed primitives if in range mode.
        if (config.IS_RANGE_MODE) {
            return {
                block,
                transactions,
                logs,
                traces,
                contracts,
                latestInteractions,
                pgBlockTimestamp: this.pgBlockTimestamp,
            }
        }

        // Save primitives to shared tables.
        await this._savePrimitives(block, transactions, logs, traces, contracts, latestInteractions)

        // Curate list of logs from transactions that succeeded.
        this._curateSuccessfulLogs()

        // Create and publish Spec events to the event relay.
        try {
            await this._createAndPublishEvents()
        } catch (err) {
            this._error('Publishing events failed:', err)
        }

        // Kick off delayed job to fetch abis for new contracts.
        contracts.length && (await this._fetchAbisForNewContracts(contracts))
    }

    async _fetchAbisForNewContracts(contracts: EthContract[]) {
        // For new contracts that could possibly already have ABIs on etherscan/samczsun, 
        // Add the ability for upsertAbis to flag that the logs (and downstream events triggered by those logs/events)
        // should be decoded after this upsertAbis job runs (either within the job itself or kicked off into another).

        const missingAddresses = await getMissingAbiAddresses(contracts.map((c) => c.address))
        missingAddresses.length && await enqueueDelayedJob('upsertAbis', { addresses: missingAddresses })
    }

    async _savePrimitives(
        block: EthBlock,
        transactions: EthTransaction[],
        logs: EthLog[],
        traces: EthTrace[],
        contracts: EthContract[],
        latestInteractions: EthLatestInteraction[]
    ) {
        this._info('Saving primitives...')

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertBlock(block, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
                this._upsertTraces(traces, tx),
                this._upsertContracts(contracts, tx),
            ])
        })
        await this._upsertLatestInteractions(latestInteractions)
    }

    async _createAndPublishEvents() {
        // Contract events.
        const contractEventSpecs = await this._getDetectedContractEventSpecs()
        contractEventSpecs.length && await publishEventSpecs(contractEventSpecs)
        
        const eventOrigin = {
            chainId: this.chainId,
            blockNumber: this.blockNumber,
            blockHash: this.blockHash,
            blockTimestamp: this.block.timestamp.toISOString(),
        }

        const eventSpecs = [
            {
                name: 'eth.NewTransactions@0.0.1',
                data: NewTransactions(this.transactions),
                origin: eventOrigin,
            },
            {
                name: 'eth.NewInteractions@0.0.1',
                data: NewInteractions(this.latestInteractions),
                origin: eventOrigin,
            },
        ]

        await publishEventSpecs(eventSpecs)
    }

    async _getDetectedContractEventSpecs(): Promise<StringKeyMap[]> {
        const decodedLogs = this.successfulLogs.filter(log => !!log.eventName)
        if (!decodedLogs.length) return []

        const addresses = Array.from(new Set(decodedLogs.map(log => log.address)))
        const contractInstances = await this._getContractInstancesForAddresses(addresses)
        if (!contractInstances.length) return []

        const namespacedContractInfoByAddress = {}
        for (const contractInstance of contractInstances) {
            const contractName = contractInstance.contract?.name
            const nsp = contractInstance.contract?.namespace?.slug
            if (!contractName || !nsp) continue
            namespacedContractInfoByAddress[contractInstance.address] = {
                nsp,
                contractName,
            }
        }
        if (!Object.keys(namespacedContractInfoByAddress)) return []

        const eventSpecs = []
        for (const decodedLog of decodedLogs) {
            const { eventName, address } = decodedLog
            if (!namespacedContractInfoByAddress.hasOwnProperty(address)) continue
            const { nsp, contractName } = namespacedContractInfoByAddress[address]
            const { data, eventOrigin } = this._formatLogEventArgsForSpecEvent(decodedLog)
            const namespacedEventName = [nsp, contractName, eventName].join('.')
            eventSpecs.push({
                name: namespacedEventName,
                data: data,
                origin: eventOrigin,
            })
        }
        return eventSpecs
    }

    async _getContractInstancesForAddresses(addresses: string[]): Promise<ContractInstance[]> {
        let contractInstances = []
        try {
            contractInstances = await contractInstancesRepo().find({
                relations: { contract: { namespace: true } },
                where: {
                    address: In(addresses),
                    chainId: this.chainId,
                }
            })
        } catch (err) {
            this._error(`Error getting contract_instances: ${err}`)
            return []
        }
        return contractInstances || []        
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
            functionArgs = this._decodeFunctionArgs(abiItem.inputs, argData, tx.hash)
        } catch (err) {
            this._error(err.message)
        }
        if (!functionArgs) return tx

        tx.functionName = abiItem.name
        tx.functionArgs = functionArgs

        // Ensure args are stringifyable.
        try {
            JSON.stringify(functionArgs)
        } catch (err) {
            tx.functionArgs = null
            this._warn(`Transaction function args not stringifyable (hash=${tx.hash})`)
        }

        return tx
    }

    _decodeFunctionArgs(inputs: StringKeyMap[], argData: string, hash: string): StringKeyMap[] | null {
        let functionArgs
        try {
            const inputsWithNames = ensureNamesExistOnAbiInputs(inputs)
            const values = web3js.eth.abi.decodeParameters(inputsWithNames, `0x${argData}`)
            functionArgs = groupAbiInputsWithValues(inputsWithNames, values)
        } catch (err) {
            if (err.reason?.includes('out-of-bounds') && 
                err.code === 'BUFFER_OVERRUN' && 
                argData.length % 64 === 0 &&
                inputs.length > (argData.length / 64)
            ) {
                const numInputsToUse = argData.length / 64
                return this._decodeFunctionArgs(inputs.slice(0, numInputsToUse), argData, hash)
            }
            return null
        }
        return functionArgs || []
    }

    _decodeLogs(logs: EthLog[], abis: { [key: string]: Abi }): EthLog[] {
        const finalLogs = []
        for (let log of logs) {
            if (!log.address || !abis.hasOwnProperty(log.address) || !log.topic0) {
                finalLogs.push(log)
                continue
            }
            try {
                log = this._decodeLog(log, abis[log.address])
            } catch (err) {
                this._error(`Error decoding log for address ${log.address}: ${err}`)
            }

            finalLogs.push(log)
        }
        return finalLogs
    }

    _decodeLog(log: EthLog, abi: Abi): EthLog {
        const abiItem = abi.find(item => item.signature === log.topic0)
        if (!abiItem) return log

        const argNames = []
        const argTypes = []
        for (const input of abiItem.inputs || []) {
            input.name && argNames.push(input.name)
            argTypes.push(input.type)
        }
        if (argNames.length !== argTypes.length) {
            return log
        }

        const topics = []
        abiItem.anonymous && topics.push(log.topic0)
        log.topic1 && topics.push(log.topic1)
        log.topic2 && topics.push(log.topic2)
        log.topic3 && topics.push(log.topic3)

        const decodedArgs = web3js.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
        const numArgs = parseInt(decodedArgs.__length__)

        const argValues = []
        for (let i = 0; i < numArgs; i++) {
            const stringIndex = i.toString()
            if (!decodedArgs.hasOwnProperty(stringIndex)) continue
            argValues.push(decodedArgs[stringIndex])
        }
        if (argValues.length !== argTypes.length) return log

        const eventArgs = []
        for (let j = 0; j < argValues.length; j++) {
            eventArgs.push({
                name: argNames[j],
                type: argTypes[j],
                value: formatAbiValueWithType(argValues[j], argTypes[j]),
            })
        }

        log.eventName = abiItem.name
        log.eventArgs = eventArgs

        // Ensure args are stringifyable.
        try {
            JSON.stringify(eventArgs)
        } catch (err) {
            log.eventArgs = null
            this._warn(
                `Log event args not stringifyable (transaction_hash=${log.transactionHash}, log_index=${log.logIndex})`
            )
        }

        return log
    }

    _formatLogEventArgsForSpecEvent(log: EthLog): StringKeyMap {
        const eventOrigin = {
            chainId: this.chainId,
            transactionHash: log.transactionHash,
            contractAddress: log.address,
            blockNumber: Number(log.blockNumber),
            blockHash: log.blockHash,
            blockTimestamp: log.blockTimestamp.toISOString(),
        }
        const data = {}
        const eventArgs = (log.eventArgs || []) as StringKeyMap[]
        for (const arg of eventArgs) {
            if (arg.name) {
                data[arg.name] = arg.value
            }
        }
        return { data, eventOrigin }
    }

    _curateSuccessfulLogs() {
        const txSuccess = {}
        for (const tx of this.transactions) {
            txSuccess[tx.hash] = tx.status != EthTransactionStatus.Failure
        }
        this.successfulLogs = this.logs
            .filter(log => txSuccess[log.transactionHash])
            .sort((a, b) => (a.transactionIndex - b.transactionIndex) || (a.logIndex - b.logIndex)
        )
    }

    async _getBlockWithTransactions(): Promise<[ExternalEthBlock, EthBlock]> {
        return resolveBlock(
            this.web3,
            this.blockHash || this.blockNumber,
            this.blockNumber,
            this.chainId
        )
    }

    async _getBlockReceiptsWithLogs(): Promise<ExternalEthReceipt[]> {
        return getBlockReceipts(
            this.web3,
            this.blockHash ? { blockHash: this.blockHash } : { blockNumber: this.hexBlockNumber },
            this.blockNumber,
            this.chainId
        )
    }

    async _getTraces(): Promise<EthTrace[]> {
        try {
            return resolveBlockTraces(this.hexBlockNumber, this.blockNumber, this.chainId)
        } catch (err) {
            throw err
        }
    }

    async _waitAndRefetchReceipts(blockHash: string): Promise<ExternalEthReceipt[]> {
        const getReceipts = async () => {
            const receipts = await getBlockReceipts(
                this.web3,
                { blockHash },
                this.blockNumber,
                this.chainId
            )
            if (receipts.length && receipts[0].blockHash !== blockHash) {
                return null
            } else {
                return receipts
            }
        }

        let receipts = null
        let numAttempts = 0
        while (receipts === null && numAttempts < config.MAX_ATTEMPTS) {
            receipts = await getReceipts()
            if (receipts === null) {
                await sleep(config.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
        return receipts || []
    }

    async _waitAndRefetchTraces(blockHash: string): Promise<EthTrace[]> {
        const getTraces = async () => {
            const traces = await this._getTraces()
            if (traces.length && traces[0].blockHash !== blockHash) {
                return null
            } else {
                return traces
            }
        }

        let traces = null
        let numAttempts = 0
        while (traces === null && numAttempts < config.MAX_ATTEMPTS) {
            traces = await getTraces()
            if (traces === null) {
                await sleep(config.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
        return traces || []
    }

    _ensureAllShareSameBlockHash(
        block: EthBlock,
        receipts: ExternalEthReceipt[],
        traces: EthTrace[]
    ) {
        const hash = this.head.blockHash || block.hash
        if (block.hash !== hash) {
            throw `Block has hash mismatch -- Truth: ${hash}; Received: ${block.hash}`
        }
        if (receipts.length > 0) {
            receipts.forEach((r) => {
                if (r.blockHash !== hash) {
                    throw `Receipts have hash mismatch -- Truth: ${hash}; Received: ${r.blockHash}`
                }
            })
        }
        if (traces.length > 0) {
            traces.forEach((t) => {
                if (t.blockHash !== hash) {
                    throw `Traces have hash mismatch -- Truth: ${hash}; Received: ${t.blockHash}`
                }
            })
        }
    }

    async _upsertBlock(block: EthBlock, tx: any) {
        const [updateCols, conflictCols] = fullBlockUpsertConfig(block)
        const blockTimestamp = this.pgBlockTimestamp
        this.block =
            (
                await tx
                    .createQueryBuilder()
                    .insert()
                    .into(EthBlock)
                    .values({ ...block, timestamp: () => blockTimestamp })
                    .orUpdate(updateCols, conflictCols)
                    .returning('*')
                    .execute()
            ).generatedMaps[0] || null
    }

    async _upsertTransactions(transactions: EthTransaction[], tx: any) {
        if (!transactions.length) return
        const [updateCols, conflictCols] = fullTransactionUpsertConfig(transactions[0])
        const blockTimestamp = this.pgBlockTimestamp
        this.transactions = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(EthTransaction)
                .values(transactions.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps
    }

    async _upsertLogs(logs: EthLog[], tx: any) {
        if (!logs.length) return
        const [updateCols, conflictCols] = fullLogUpsertConfig(logs[0])
        const blockTimestamp = this.pgBlockTimestamp
        this.logs = (
            await Promise.all(
                toChunks(logs, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(EthLog)
                        .values(chunk.map((l) => ({ ...l, blockTimestamp: () => blockTimestamp })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps)
            .flat()
    }

    async _upsertTraces(traces: EthTrace[], tx: any) {
        if (!traces.length) return
        const [updateCols, conflictCols] = fullTraceUpsertConfig(traces[0])
        const blockTimestamp = this.pgBlockTimestamp
        this.traces = (
            await Promise.all(
                toChunks(traces, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(EthTrace)
                        .values(chunk.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps)
            .flat()
    }

    async _upsertContracts(contracts: EthContract[], tx: any) {
        if (!contracts.length) return
        const [updateCols, conflictCols] = fullContractUpsertConfig(contracts[0])
        const blockTimestamp = this.pgBlockTimestamp
        this.contracts = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(EthContract)
                .values(contracts.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps
    }

    async _upsertLatestInteractions(
        latestInteractions: EthLatestInteraction[],
        attempt: number = 0
    ) {
        if (!latestInteractions.length) return
        const [updateCols, conflictCols] = fullLatestInteractionUpsertConfig(latestInteractions[0])
        const blockTimestamp = this.pgBlockTimestamp

        try {
            await SharedTables.manager.transaction(async (tx) => {
                this.latestInteractions = (
                    await (tx as any)
                        .createQueryBuilder()
                        .insert()
                        .into(EthLatestInteraction)
                        .values(
                            latestInteractions.map((li) => ({
                                ...li,
                                timestamp: () => blockTimestamp,
                            }))
                        )
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                ).generatedMaps
            })
        } catch (err) {
            this._error(err)
            const message = err?.message || ''
            this.latestInteractions = []

            // Wait and try again if deadlocked.
            if (attempt < 3 && message.toLowerCase().includes('deadlock')) {
                this._error(`[Attempt ${attempt}] Got deadlock, trying again...`)
                await sleep(this.blockNumber / 150000)
                await this._upsertLatestInteractions(latestInteractions, attempt + 1)
            }
        }
    }

    _enrichTraces(traces: EthTrace[], block: EthBlock): EthTrace[] {
        return traces.map((t, i) => {
            t.traceIndex = i > 32767 ? -1 : i
            t.blockTimestamp = block.timestamp
            return t
        })
    }

    async _deleteRecordsWithBlockNumber() {
        await SharedTables.manager.transaction(async (tx) => {
            const deleteBlock = tx
                .createQueryBuilder()
                .delete()
                .from(EthBlock)
                .where('number = :number', { number: this.blockNumber })
                .execute()
            const deleteTransactions = tx
                .createQueryBuilder()
                .delete()
                .from(EthTransaction)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            const deleteLogs = tx
                .createQueryBuilder()
                .delete()
                .from(EthLog)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            const deleteTraces = tx
                .createQueryBuilder()
                .delete()
                .from(EthTrace)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            const deleteContracts = tx
                .createQueryBuilder()
                .delete()
                .from(EthContract)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            await Promise.all([
                deleteBlock,
                deleteTransactions,
                deleteLogs,
                deleteTraces,
                deleteContracts,
            ])
        })
    }
}

export default EthereumIndexer