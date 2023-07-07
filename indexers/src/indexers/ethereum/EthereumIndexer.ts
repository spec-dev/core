import AbstractIndexer from '../AbstractIndexer'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import getContracts from './services/getContracts'
import { originEvents } from '../../events'
import config from '../../config'
import Web3 from 'web3'
import chalk from 'chalk'
import { ident } from 'pg-format'
import { resolveNewTokenContracts, getLatestTokenBalances } from '../../services/contractServices'
import extractSpecialErc20BalanceEventData from '../../services/extractSpecialErc20BalanceEventData'
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
    getAbis,
    getFunctionSignatures,
    Abi,
    AbiItem,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    formatAbiValueWithType,
    schemas,
    uniqueByKeys,
    unique,
    chainIds,
    Erc20Token,
    NftCollection,
    TokenTransfer,
    EthTraceStatus,
    EthTraceType,
    Erc20Balance,
    randomIntegerInRange,
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
    specialErc20BalanceAffectingAbis,
    getContractGroupAbis,
} from '../../../../shared'
import { 
    decodeTransferEvent, 
    decodeTransferSingleEvent, 
    decodeTransferBatchEvent,
} from '../../services/extractTransfersFromLogs'
import initTokenTransfers from '../../services/initTokenTransfers'

const web3js = new Web3()

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

        // Quick re-org check.
        if (!(await this._shouldContinue())) {
            this._warn('Job stopped mid-indexing.')
            return
        }

        // Convert external block transactions into our custom external eth transaction type.
        const externalTransactions = externalBlock.transactions.map(
            (t) => t as unknown as ExternalEthTransaction
        )
        const hasTxs = !!externalTransactions.length
        if (!hasTxs) {
            this._info('No transactions this block.')
        }

        // Ensure there's not a block hash mismatch between block and receipts 
        // and that there are no missing logs.
        const isHashMismatch = receipts.length && receipts[0].blockHash !== block.hash
        const hasMissingLogs = hasTxs && !receipts.length
        if (isHashMismatch || hasMissingLogs) {
            this._warn(
                isHashMismatch
                    ? `Hash mismatch with receipts for block ${block.hash} -- refetching until equivalent.`
                    : `Transactions exist but no receipts were found -- retrying`
            )
            receipts = await this._waitAndRefetchReceipts(block.hash, hasTxs)
            if (hasTxs && !receipts.length) {
                throw `Failed to fetch receipts when transactions (count=${externalTransactions.length}) clearly exist.`
            }
        }
        
        // Another re-org check.
        if (!(await this._shouldContinue())) {
            this._warn('Job stopped mid-indexing, post-fetch.')
            return
        }

        // Initialize internal models for both transactions and logs.
        let transactions = externalTransactions.length
            ? initTransactions(block, externalTransactions, receipts)
            : []
        let logs = receipts?.length ? initLogs(block, receipts) : []

        // Wait for traces to resolve and ensure there's not a block hash mismatch.
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
        let [abis, functionSignatures] = await Promise.all([
            getAbis(unique([ ...txToAddresses, ...traceToAddresses, ...logAddresses ]), this.chainId),
            getFunctionSignatures(sigs),
        ])
        abis = abis || {}
        const numAbis = Object.keys(abis).length
        const numFunctionSigs = Object.keys(functionSignatures).length

        // Decode transactions, traces, and logs.
        transactions = transactions.length && (numAbis || numFunctionSigs) 
            ? this._decodeTransactions(transactions, abis, functionSignatures) 
            : transactions
        traces = traces.length && (numAbis || numFunctionSigs) 
            ? this._decodeTraces(traces, abis, functionSignatures) 
            : traces
        logs = logs.length ? this._decodeLogs(logs, abis) : logs
        
        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts || [], traces)

        // New contracts deployed this block.
        const contracts = getContracts(traces)
        contracts.length && this._info(`Got ${contracts.length} new contracts.`)

        // New ERC-20 tokens & NFT collections.
        const newTokens = await resolveNewTokenContracts(contracts, this.chainId)
        const [erc20Tokens, nftCollections] = newTokens
        erc20Tokens.length && this._info(`${erc20Tokens.length} new ERC-20 tokens.`)
        nftCollections.length && this._info(`${nftCollections.length} new NFT collections.`)

        // Filter logs and traces to only those that succeeded.
        const txSuccess = {}
        for (const tx of transactions) {
            txSuccess[tx.hash] = tx.status != EthTransactionStatus.Failure
        }
        this.successfulLogs = logs
            .filter(log => txSuccess[log.transactionHash])
            .sort((a, b) => (a.transactionIndex - b.transactionIndex) || (a.logIndex - b.logIndex)
        )
        const successfulTraces = traces.filter(t => t.status !== EthTraceStatus.Failure)

        // All token transfers.
        const [
            tokenTransfers, 
            erc20TotalSupplyUpdates,
            referencedErc20TokensMap,
        ] = config.IS_RANGE_MODE
            ? [[], []] 
            : await initTokenTransfers(
                erc20Tokens,
                nftCollections,
                this.successfulLogs,
                successfulTraces,
                this.chainId,
            )
        tokenTransfers.length && this._info(`${tokenTransfers.length} token transfers.`)

        // Refresh any ERC-20 balances and NFT balances that could have changed.
        const specialErc20BalanceDataByOwner = await extractSpecialErc20BalanceEventData(
            this.successfulLogs,
            referencedErc20TokensMap,
            this.chainId,
        )
        let [erc20Balances, _] = await getLatestTokenBalances(
            tokenTransfers,
            specialErc20BalanceDataByOwner,
        )
        erc20Balances = this._enrichErc20Balances(erc20Balances, block)
        erc20Balances.length && this._info(`${erc20Balances.length} new ERC-20 balances.`)

        // One last check before saving.
        if (!(await this._shouldContinue())) {
            this._warn('Job stopped mid-indexing, pre-save.')
            return
        }

        // One last check before saving primitives / publishing events.
        if (await this._alreadyIndexedBlock()) {
            this._warn('Current block was already indexed. Stopping pre-save.')
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
                erc20Tokens,
                nftCollections,
                tokenTransfers,
                pgBlockTimestamp: this.pgBlockTimestamp,
            }
        }

        // Save primitives to shared tables.
        await this._savePrimitives(
            block, 
            transactions, 
            logs,
            traces,
            contracts,
            erc20Tokens,
            erc20Balances,
            nftCollections,
            tokenTransfers,
            erc20TotalSupplyUpdates,
        )

        // Create and publish Spec events to the event relay.
        try {
            await this._createAndPublishEvents()
        } catch (err) {
            this._error('Publishing events failed:', err)
        }

        this._info(chalk.cyanBright(`Successfully indexed block ${this.blockNumber}.`))
    }

    async _alreadyIndexedBlock(): Promise<boolean> {
        return !config.IS_RANGE_MODE 
            && !this.head.force 
            && !this.head.replace 
            && (await this._blockAlreadyExists(schemas.ethereum()))
    }

    async _savePrimitives(
        block: EthBlock,
        transactions: EthTransaction[],
        logs: EthLog[],
        traces: EthTrace[],
        contracts: EthContract[],
        erc20Tokens: Erc20Token[],
        erc20Balances: Erc20Balance[],
        nftCollections: NftCollection[],
        tokenTransfers: TokenTransfer[],
        erc20TotalSupplyUpdates: StringKeyMap[],
    ) {
        this._info('Saving primitives...')
        this.saving = true

        let attempt = 1
        while (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK) {
            try {
                await SharedTables.manager.transaction(async (tx) => {
                    await Promise.all([
                        this._upsertBlock(block, tx),
                        this._upsertTransactions(transactions, tx),
                        this._upsertLogs(logs, tx),
                        this._upsertTraces(traces, tx),
                        this._upsertContracts(contracts, tx),
                        this._upsertErc20Tokens(erc20Tokens, tx),
                        this._upsertErc20Balances(erc20Balances, tx),
                        this._upsertNftCollections(nftCollections, tx),
                        this._upsertTokenTransfers(tokenTransfers, tx),
                    ])
                })
                break
            } catch (err) {
                attempt++
                const message = err.message || err.toString() || ''
                if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
                    this._error(`Got deadlock on primitives. Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`)
                    await sleep(randomIntegerInRange(50, 500))
                    continue
                }
                throw err
            }
        }
        erc20TotalSupplyUpdates.length && await this._bulkUpdateErc20TokensTotalSupply(
            erc20TotalSupplyUpdates,
            this.block.timestamp.toISOString(),
        )
    }

    async _createAndPublishEvents() {
        const eventOrigin = {
            chainId: this.chainId,
            blockNumber: this.blockNumber,
            blockHash: this.blockHash,
            blockTimestamp: this.block.timestamp.toISOString(),
        }

        const isMainnet = this.chainId === chainIds.ETHEREUM

        // eth.NewBlock
        const originEventSpecs = isMainnet ? [
            originEvents.eth.NewBlock(this.block, eventOrigin),
        ] : []

        // eth.NewTransactions
        isMainnet && this.transactions?.length && originEventSpecs.push(
            ...(toChunks(this.transactions, config.MAX_EVENTS_LENGTH).map(txs => 
                originEvents.eth.NewTransactions(txs, eventOrigin)
            ))
        )

        // eth.NewContracts
        isMainnet && this.contracts?.length && originEventSpecs.push(
            ...(toChunks(this.contracts, config.MAX_EVENTS_LENGTH).map(contracts => 
                originEvents.eth.NewContracts(contracts, eventOrigin)
            ))
        )

        // tokens.NewTokenTransfers
        this.tokenTransfers?.length && originEventSpecs.push(
            ...(toChunks(this.tokenTransfers, config.MAX_EVENTS_LENGTH).map(transfers => 
                originEvents.tokens.NewTokenTransfers(transfers, eventOrigin)
            ))
        )

        // tokens.NewErc20Balances
        this.erc20Balances?.length && originEventSpecs.push(
            ...(toChunks(this.erc20Balances, config.MAX_EVENTS_LENGTH).map(balances => 
                originEvents.tokens.NewErc20Balances(balances, eventOrigin)
            ))
        )

        // Decode contract events and function calls.
        const decodedLogs = this.successfulLogs.filter(l => !!l.eventName)
        const logContractAddresses = new Set(decodedLogs.map(l => l.address))

        const decodedTraceCalls = this.traces.filter(t => (
            t.status !== EthTraceStatus.Failure && !!t.functionName && !!t.to && t.traceType === EthTraceType.Call
        ))
        const traceToAddresses = new Set(decodedTraceCalls.map(t => t.to))

        const referencedContractInstances = await this._getContractInstancesForAddresses(
            unique([...Array.from(logContractAddresses), ...Array.from(traceToAddresses)])
        )

        const eventContractInstances = []
        const callContractInstances = []
        const uniqueContractGroups = new Set<string>()
        for (const contractInstance of referencedContractInstances) {
            const nsp = contractInstance.contract?.namespace?.name
            if (!nsp || !nsp.startsWith(this.contractEventNsp)) continue
            
            const contractGroup = nsp.split('.').slice(2).join('.')
            if (!contractGroup) continue
            uniqueContractGroups.add(contractGroup)

            if (logContractAddresses.has(contractInstance.address)) {
                eventContractInstances.push(contractInstance)
            }
            if (traceToAddresses.has(contractInstance.address)) {
                callContractInstances.push(contractInstance)
            }
        }

        const contractGroupAbis = await getContractGroupAbis(
            Array.from(uniqueContractGroups),
            this.chainId,
        )
        const namespacedContractGroupAbis = {}
        for (const contractGroup in contractGroupAbis) {
            const abi = contractGroupAbis[contractGroup]
            const key = [this.contractEventNsp, contractGroup].join('.')
            namespacedContractGroupAbis[key] = abi
        }

        const [contractEventSpecs, contractCallSpecs] = await Promise.all([
            this._getDetectedContractEventSpecs(
                decodedLogs,
                eventContractInstances,
                namespacedContractGroupAbis,
            ),
            this._getDetectedContractCallSpecs(
                decodedTraceCalls,
                callContractInstances,
                namespacedContractGroupAbis,
            ),
        ])

        const allEventSpecs = [...contractEventSpecs, ...originEventSpecs]
        await this._kickBlockDownstream(allEventSpecs, contractCallSpecs)
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
                    this._warn(`Error decoding log for address ${log.address}: ${err}`)
                }
            }
            // Try decoding as transfer event if couldn't decode with contract ABI.
            if (!log.eventName) {
                try {
                    log = this._tryDecodingLogAsTransfer(log)
                } catch (err) {
                    this._warn(`Error decoding log as transfer ${log.logIndex}-${log.transactionHash}: ${err}`)
                }
            }
            // Try decoding with any special, non-standard, ERC-20 events that may affect balances.
            if (!log.eventName && log.address && log.topic0 && log.topic1 && specialErc20BalanceAffectingAbis[log.topic0]) {
                const abi = specialErc20BalanceAffectingAbis[log.topic0]
                try {
                    log = this._decodeLog(log, [abi])
                } catch (err) {
                    this._warn(
                        `Error decoding log with special ERC-20 balance-affecting ABI (${log.topic0}):`,
                        log,
                        err
                    )
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
        const abiInputs = abiItem.inputs || []
        for (let i = 0; i < abiInputs.length; i++) {
            const input = abiInputs[i]
            argNames.push(input.name || `param${i}`)
            argTypes.push(input.type)
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

    async _getBlockWithTransactions(): Promise<[ExternalEthBlock, EthBlock]> {
        return resolveBlock(
            this.web3,
            this.blockNumber,
            this.chainId
        )
    }

    async _getBlockReceiptsWithLogs(): Promise<ExternalEthReceipt[]> {
        return getBlockReceipts(
            this.web3,
            { blockNumber: this.hexBlockNumber },
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

    async _waitAndRefetchReceipts(blockHash: string, hasTxs: boolean): Promise<ExternalEthReceipt[]> {
        const getReceipts = async () => {
            const receipts = await getBlockReceipts(
                this.web3,
                { blockHash },
                this.blockNumber,
                this.chainId
            )
            // Hash mismatch.
            if (receipts.length && receipts[0].blockHash !== blockHash) {
                return null
            }
            // Missing logs.
            else if (!receipts.length && hasTxs) {
                return null
            }
            // All good.
            else {
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
        const hash = this.blockHash
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
        ).generatedMaps || []
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
            .map((result) => result.generatedMaps || [])
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
            .map((result) => result.generatedMaps || [])
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
        ).generatedMaps || []
    }

    async _upsertLatestInteractions(latestInteractions: EthLatestInteraction[], tx: any) {
        if (!latestInteractions.length) return
        const [updateCols, conflictCols] = fullLatestInteractionUpsertConfig(latestInteractions[0])
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `${schemas.ethereum()}.latest_interactions.block_number < excluded.block_number`
        const blockTimestamp = this.pgBlockTimestamp
        latestInteractions = uniqueByKeys(latestInteractions, conflictCols) as EthLatestInteraction[]
        this.latestInteractions = (
            await Promise.all(
                toChunks(latestInteractions, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(EthLatestInteraction)
                        .values(chunk.map((li) => ({ ...li, timestamp: () => blockTimestamp })))
                        .onConflict(
                            `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                        )
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps || [])
            .flat()
            .filter(li => li && !!Object.keys(li).length) as EthLatestInteraction[]
    }

    _enrichErc20Balances(erc20Balances: Erc20Balance[], block: EthBlock): Erc20Balance[] {
        return erc20Balances.map(b => ({
            ...b,
            blockNumber: this.blockNumber,
            blockHash: this.blockHash,
            blockTimestamp: block.timestamp,
            chainId: this.chainId,
        }))
    }

    _enrichTraces(traces: EthTrace[], block: EthBlock): EthTrace[] {
        return traces.map((t, i) => {
            t.traceIndex = i > 32767 ? -1 : i
            t.blockTimestamp = block.timestamp
            return t
        })
    }
}

export default EthereumIndexer