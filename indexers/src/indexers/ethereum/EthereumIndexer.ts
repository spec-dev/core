import AbstractIndexer from '../AbstractIndexer'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import getContracts from './services/getContracts'
import initLatestInteractions from './services/initLatestInteractions'
import { originEvents } from '../../events'
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
    randomIntegerInRange,
    uniqueByKeys,
    unique,
    snakeToCamel,
    stripLeadingAndTrailingUnderscores,
    toNamespacedVersion,
} from '../../../../shared'
import { 
    decodeTransferEvent, 
    decodeTransferSingleEvent, 
    decodeTransferBatchEvent,
} from '../../services/extractTransfersFromLogs'
import { 
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
} from '../../utils/standardAbis'

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
        if (await this._alreadyIndexedBlock()) {
            this._warn('Current block was already indexed. Stopping.')
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
            await sleep(1000)
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

        // Initialize internal models for both transactions and logs.
        let transactions = externalTransactions.length
            ? initTransactions(block, externalTransactions, receipts)
            : []
        let logs = receipts?.length ? initLogs(block, receipts) : []

        // Wait for traces to resolve and ensure there's not block hash mismatch.
        let traces = await tracesPromise
        if (traces.length && traces[0].blockHash !== block.hash) {
            this._warn(
                `Hash mismatch with traces for block ${block.hash} -- refetching until equivalent.`
            )
            traces = await this._waitAndRefetchTraces(block.hash)
        }
        traces = this._enrichTraces(traces, block)

        // Get all abis for addresses needed to decode transactions, traces, and logs.
        const txToAddresses = transactions.map(t => t.to).filter(v => !!v)
        const traceToAddresses = traces.map(t => t.to).filter(v => !!v)
        const logAddresses = logs.map(l => l.address).filter(v => !!v)
        const sigs = unique([
            ...transactions.filter(tx => !!tx.input).map(tx => tx.input.slice(0, 10)),
            ...traces.filter(trace => !!trace.input).map(trace => trace.input.slice(0, 10)),
        ])
        const [abis, functionSignatures] = await Promise.all([
            getAbis(unique([ ...txToAddresses, ...traceToAddresses, ...logAddresses ])),
            getFunctionSignatures(sigs),
        ])
        const numAbis = Object.keys(abis).length
        const numFunctionSigs = Object.keys(functionSignatures).length

        // Decode transactions, traces, and logs.
        transactions = transactions.length && (numAbis || numFunctionSigs) 
            ? this._decodeTransactions(transactions, abis, functionSignatures) 
            : transactions
        traces = traces.length && (numAbis || numFunctionSigs) 
            ? this._decodeTraces(traces, abis, functionSignatures) 
            : traces
        logs = logs.length && numAbis ? this._decodeLogs(logs, abis) : logs
        
        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts || [], traces)

        // Get any new contracts deployed this block.
        const contracts = getContracts(traces)
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

        // One last check before saving primitives / publishing events.
        if (await this._alreadyIndexedBlock()) {
            this._warn('Current block was already indexed. Stopping.')
            return
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

    async _alreadyIndexedBlock(): Promise<boolean> {
        if (this.head.force) return false
        return !config.IS_RANGE_MODE && !this.head.replace && (await this._blockAlreadyExists(schemas.ETHEREUM))
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
        // The `eventTimestamp` field will be added later before emission.
        const eventOrigin = {
            chainId: this.chainId,
            blockNumber: this.blockNumber,
            blockHash: this.blockHash,
            blockTimestamp: this.block.timestamp.toISOString(),
        }

        // eth.NewBlock
        const originEventSpecs = [
            originEvents.eth.NewBlock(this.block, eventOrigin),
        ]

        // eth.NewTransactions
        this.transactions?.length && originEventSpecs.push(
            originEvents.eth.NewTransactions(this.transactions, eventOrigin)
        )

        // eth.NewContracts
        this.contracts?.length && originEventSpecs.push(
            originEvents.eth.NewContracts(this.contracts, eventOrigin)
        )

        // eth.NewInteractions
        this.latestInteractions?.length && originEventSpecs.push(
            originEvents.eth.NewInteractions(this.latestInteractions, eventOrigin)
        )

        // Decoded contract events.
        const contractEventSpecs = await this._getDetectedContractEventSpecs()

        // Publish to Spec's event network.
        await this._reportBlockEvents([
            ...contractEventSpecs,
            ...originEventSpecs,
        ])
    }

    async _getDetectedContractEventSpecs(): Promise<StringKeyMap[]> {
        const decodedLogs = this.successfulLogs.filter(log => !!log.eventName)
        if (!decodedLogs.length) return []

        const addresses = unique(decodedLogs.map(log => log.address))
        const contractInstances = await this._getContractInstancesForAddresses(addresses)
        if (!contractInstances.length) return []

        const contractDataByAddress = {}
        for (const contractInstance of contractInstances) {
            const nsp = contractInstance.contract?.namespace?.name
            if (!nsp || !nsp.startsWith(this.contractEventNsp)) continue

            if (!contractDataByAddress.hasOwnProperty(contractInstance.address)) {
                contractDataByAddress[contractInstance.address] = []
            }
            contractDataByAddress[contractInstance.address].push({
                nsp,
                contractInstanceName: contractInstance.name,
            })
        }
        if (!Object.keys(contractDataByAddress)) return []

        const eventSpecs = []
        for (const decodedLog of decodedLogs) {
            const { eventName, address } = decodedLog
            const contractData = contractDataByAddress[address] || []
            if (!contractData.length) continue

            for (const { nsp, contractInstanceName } of contractData) {
                const { data, eventOrigin } = this._formatLogAsSpecEvent(
                    decodedLog, 
                    contractInstanceName,
                )
                eventSpecs.push({
                    origin: eventOrigin,
                    name: toNamespacedVersion(nsp, eventName, '0.0.1'),
                    data: data,
                })    
            }
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

        tx.functionName = abiItem.name
        tx.functionArgs = []

        if (!abiItem.inputs?.length) return tx

        let functionArgs
        try {
            functionArgs = this._decodeFunctionArgs(abiItem.inputs, argData)
        } catch (err) {
            this._error(err.message)
        }
        if (!functionArgs) return tx

        // Ensure args are stringifyable.
        try {
            JSON.stringify(functionArgs)
        } catch (err) {
            functionArgs = null
            this._warn(`Transaction function args not stringifiable (hash=${tx.hash})`)
        }

        tx.functionArgs = functionArgs

        return tx
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
                functionArgs = this._decodeFunctionArgs(abiItem.inputs, inputData)
            } catch (err) {
                this._error(err.message)
            }

            // Ensure args are stringifyable.
            try {
                functionArgs && JSON.stringify(functionArgs)
            } catch (err) {
                functionArgs = null
                this._warn(`Trace function args not stringifyable (id=${trace.id})`)
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
                this._error(err.message)
            }

            // Ensure outputs are stringifyable.
            try {
                functionOutputs && JSON.stringify(functionOutputs)
            } catch (err) {
                functionOutputs = null
                this._warn(`Trace function outputs not stringifyable (id=${trace.id})`)
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
            const values = web3js.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
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

    _decodeLogs(logs: EthLog[], abis: { [key: string]: Abi }): EthLog[] {
        const finalLogs = []
        for (let log of logs) {
            // Standard contract ABI decoding.
            if (log.address && log.topic0 && abis.hasOwnProperty(log.address)) {
                try {
                    log = this._decodeLog(log, abis[log.address])
                } catch (err) {
                    this._error(`Error decoding log for address ${log.address}: ${err}`)
                }
            }
            // Try decoding as transfer event if couldn't decode with contract ABI.
            if (!log.eventName) {
                try {
                    log = this._tryDecodingLogAsTransfer(log)
                } catch (err) {
                    this._error(`Error decoding log as transfer ${log.logIndex}-${log.transactionHash}: ${err}`)
                }
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

    _tryDecodingLogAsTransfer(log: EthLog): EthLog {
        let eventName, eventArgs

        // Transfer
        if (log.topic0 === TRANSFER_TOPIC) {
            eventArgs = decodeTransferEvent(log, true)
            if (!eventArgs) return log
            eventName = TRANSFER_EVENT_NAME
        }

        // TransferSingle
        if (log.topic0 === TRANSFER_SINGLE_TOPIC) {
            eventArgs = decodeTransferSingleEvent(log, true)
            if (!eventArgs) return log
            eventName = TRANSFER_SINGLE_EVENT_NAME
        }

        // TransferBatch
        if (log.topic0 === TRANSFER_BATCH_TOPIC) {
            eventArgs = decodeTransferBatchEvent(log, true)
            if (!eventArgs) return log
            eventName = TRANSFER_BATCH_EVENT_NAME
        }

        if (!eventName) return log

        log.eventName = eventName
        log.eventArgs = eventArgs as StringKeyMap[]

        return log
    }

    _formatLogAsSpecEvent(log: EthLog, contractInstanceName: string): StringKeyMap {
        const eventOrigin = {
            contractAddress: log.address,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex,
            logIndex: log.logIndex,
            blockHash: log.blockHash,
            blockNumber: Number(log.blockNumber),
            blockTimestamp: log.blockTimestamp.toISOString(),
            chainId: this.chainId,
        }
        
        const fixedContractEventProperties = {
            ...eventOrigin,
            contractName: contractInstanceName,
            logIndex: log.logIndex,
        }

        const logEventArgs = (log.eventArgs || []) as StringKeyMap[]
        const eventProperties = []
        for (const arg of logEventArgs) {
            if (!arg.name) continue
            eventProperties.push({
                name: snakeToCamel(stripLeadingAndTrailingUnderscores(arg.name)),
                value: arg.value,
            })
        }
        
        // Ensure event arg property names are unique.
        const seenPropertyNames = new Set(Object.keys(fixedContractEventProperties))
        for (const property of eventProperties) {
            let propertyName = property.name
            while (seenPropertyNames.has(propertyName)) {
                propertyName = '_' + propertyName
            }
            seenPropertyNames.add(propertyName)
            property.name = propertyName
        }

        const data = {
            ...fixedContractEventProperties
        }
        for (const property of eventProperties) {
            data[property.name] = property.value
        }

        return { data, eventOrigin }
    }

    _curateSuccessfulLogs() {
        const txSuccess = {}
        for (const tx of this.transactions) {
            txSuccess[tx.hash] = tx.status != EthTransactionStatus.Failure
        }

        // TODO: transactionIndex is unnecessary here.
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
        while (receipts === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            receipts = await getReceipts()
            if (receipts === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
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
        while (traces === null && numAttempts < config.EXPO_BACKOFF_MAX_ATTEMPTS) {
            traces = await getTraces()
            if (traces === null) {
                await sleep(
                    (config.EXPO_BACKOFF_FACTOR ** numAttempts) * config.EXPO_BACKOFF_DELAY
                )
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
        transactions = uniqueByKeys(transactions, conflictCols) as EthTransaction[]
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
        logs = uniqueByKeys(logs, ['logIndex', 'transactionHash']) as EthLog[]
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
        traces = uniqueByKeys(traces, conflictCols) as EthTrace[]
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
        contracts = uniqueByKeys(contracts, conflictCols) as EthContract[]
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
        attempt: number = 1
    ) {
        if (!latestInteractions.length) return
        const [updateCols, conflictCols] = fullLatestInteractionUpsertConfig(latestInteractions[0])
        const blockTimestamp = this.pgBlockTimestamp
        latestInteractions = uniqueByKeys(latestInteractions, conflictCols) as EthLatestInteraction[]
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
            const message = err.message || err.toString() || ''
            this.latestInteractions = []

            // Wait and try again if deadlocked.
            if (attempt <= 3 && message.toLowerCase().includes('deadlock')) {
                this._error(`[Attempt ${attempt}] Got deadlock, trying again...`)
                await sleep(randomIntegerInRange(50, 150))
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

    async _deleteRecordsWithBlockNumber(attempt: number = 1) {
        try {
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
        } catch (err) {
            this._error(err)
            const message = err.message || err.toString() || ''
            if (attempt <= 3 && message.toLowerCase().includes('deadlock')) {
                this._error(`[Attempt ${attempt}] Got deadlock, trying again...`)
                await sleep(randomIntegerInRange(50, 150))
                await this._deleteRecordsWithBlockNumber(attempt + 1)
            } else {
                throw err
            }
        }
    }
}

export default EthereumIndexer