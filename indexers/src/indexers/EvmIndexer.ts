import {
    NewReportedHead,
    logger,
    SharedTables,
    StringKeyMap,
    contractNamespaceForChainId,
    saveBlockEvents,
    saveBlockCalls,
    EvmBlock,
    EvmTransaction,
    EvmTrace,
    EvmLog,
    EvmContract,
    Erc20Token,
    Erc20Balance,
    NftCollection,
    fullErc20TokenUpsertConfig,
    fullErc20BalanceUpsertConfig,
    fullNftCollectionUpsertConfig,
    fullTokenTransferUpsertConfig,
    fullEvmBlockUpsertConfig,
    fullEvmTransactionUpsertConfig,
    fullEvmLogUpsertConfig,
    fullEvmTraceUpsertConfig,
    fullEvmContractUpsertConfig,
    uniqueByKeys,
    TokenTransfer,
    snakeToCamel,
    formatLogAsSpecEvent,
    formatTraceAsSpecCall,
    toChunks,
    mapByKey,
    canBlockBeOperatedOn,
    normalizeEthAddress,
    hexToNumber,
    normalize32ByteHash,
    hexToNumberString,
    sleep,
    randomIntegerInRange,
    ContractInstance,
    toNamespacedVersion,
    In,
    currentChainSchema,
    Abi,
    CoreDB,
    externalToInternalLog,
    ExternalEvmReceipt,
    chainIds,
    EvmTraceType,
    EvmTransactionStatus,
    unique,
    EvmTraceStatus,
    getAbis,
    getFunctionSignatures,
    AbiItem,
    ensureNamesExistOnAbiInputs,
    formatAbiValueWithType,
    groupAbiInputsWithValues,
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
    specialErc20BalanceAffectingAbis,
    getContractGroupAbis,
    publishForcedRollback,
} from '../../../shared'
import config from '../config'
import short from 'short-uuid'
import { Pool } from 'pg'
import { reportBlockEvents } from '../events'
import chalk from 'chalk'
import { ident } from 'pg-format'
import Web3 from 'web3'
import { getWeb3 } from '../httpProviderPool'
import { extractNewContractDeploymentsFromTraces } from '../services/contractServices'
import { 
    decodeTransferEvent, 
    decodeTransferSingleEvent, 
    decodeTransferBatchEvent,
} from '../services/extractTransfersFromLogs'
import { resolveNewTokenContracts, getLatestTokenBalances } from '../services/contractServices'
import extractSpecialErc20BalanceEventData from '../services/extractSpecialErc20BalanceEventData'
import initTokenTransfers from '../services/initTokenTransfers'
import { originEvents } from '../events'

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

const web3Decoder = new Web3()

class EvmIndexer {
    
    head: NewReportedHead

    indexTraces: boolean

    indexTokenTransfers: boolean
    
    indexTokenBalances: boolean 

    timedOut: boolean = false

    resolvedBlockHash: string | null

    blockUnixTimestamp: number | null

    contractEventNsp: string

    pool: Pool

    block: EvmBlock

    transactions: EvmTransaction[] = []

    logs: EvmLog[] = []

    traces: EvmTrace[] = []

    contracts: EvmContract[] = []

    successfulLogs: EvmLog[] = []

    successfulTraces: EvmTrace[] = []

    erc20Tokens: Erc20Token[] = []

    erc20Balances: Erc20Balance[] = []

    nftCollections: NftCollection[] = []

    tokenTransfers: TokenTransfer[] = []

    blockEvents: StringKeyMap[] = []
    
    blockCalls: StringKeyMap[] = []

    saving: boolean = false

    didFetchPrimitives: boolean = false

    reorgDetectedViaLogs: boolean = false

    existingBlockTimestamp: string | null

    t0: number

    tf: number

    get chainId(): string {
        return this.head.chainId
    }

    get blockNumber(): number {
        return this.head.blockNumber
    }

    get givenBlockHash(): string | null {
        return this.head.blockHash
    }

    get blockHash(): string | null {
        return this.resolvedBlockHash || this.givenBlockHash
    }

    get logPrefix(): string {
        return `[${this.chainId}:${this.blockNumber}]`
    }

    get pgBlockTimestamp(): string {
        return `timezone('UTC', to_timestamp(${this.blockUnixTimestamp}))`
    }

    get canGetBlockReceipts(): boolean {
        return getWeb3().canGetBlockReceipts
    }

    get elapsedTime(): number {
        if (!this.t0 || !this.tf) return 0
        return Number(((this.tf - this.t0) / 1000).toFixed(2))
    }

    constructor(head: NewReportedHead, options?: {
        indexTraces?: boolean
        indexTokenTransfers?: boolean
        indexTokenBalances?: boolean
    }) {
        this.head = head
        this.indexTraces = options?.indexTraces !== false
        this.indexTokenTransfers = options?.indexTokenTransfers || false
        this.indexTokenBalances = options?.indexTokenBalances || false
        this.resolvedBlockHash = null
        this.blockUnixTimestamp = null
        this.contractEventNsp = contractNamespaceForChainId(this.chainId)
        this.pool = new Pool({
            host: config.SHARED_TABLES_DB_HOST,
            port: config.SHARED_TABLES_DB_PORT,
            user: config.SHARED_TABLES_DB_USERNAME,
            password: config.SHARED_TABLES_DB_PASSWORD,
            database: config.SHARED_TABLES_DB_NAME,
            max: config.SHARED_TABLES_MAX_POOL_SIZE,
            connectionTimeoutMillis: 60000,
        })
        this.pool.on('error', err => logger.error('PG client error', err))
    }

    async perform(isJobWaitingWithBlockNumber?: Function): Promise<StringKeyMap | void> {
        this.t0 = performance.now()
        this._logNewHead()

        if (await this._alreadyIndexedBlock()) {
            await this._forceRollback()
            return
        }
        
        // Fetch chain primitives.
        let { block, transactions } = await this._getBlockWithTransactions()
        let [{ logs, receipts }, traces] = await Promise.all([
            this._getLogsOrBlockReceipts(!!transactions.length),
            this._getTraces(),
        ])

        // Quick re-org check #1.
        if (!(await this._shouldContinue(isJobWaitingWithBlockNumber))) {
            this._warn('Job stopped mid-indexing (#1)')
            return
        }

        // Use block receipts to get logs & add extra data to txs (if supported).
        if (receipts !== null) {
            logs = this._initLogsWithReceipts(receipts, block)
            this._enrichTransactionsWithReceipts(transactions, receipts)
        } else {
            this._enrichLogsWithBlock(logs, block)
        }

        // Use the "removed" property of logs to detect whether this block was reorg'd.
        if (!!logs.find(log => log.removed)) {
            this.reorgDetectedViaLogs = true
            throw `[${this.chainId}] Removed logs included in block ${this.resolvedBlockHash}`
        }

        // Ensure no hash mismatches exist among the traces.
        if (traces.length && !!traces.find(t => t.blockHash !== this.resolvedBlockHash)) {
            traces = await getWeb3().getTraces(
                this.resolvedBlockHash,
                this.blockNumber,
                this.chainId,
                true, // force debug
            )
        }
        this._enrichTracesWithBlock(traces, block)

        // Quick re-org check #2.
        if (!(await this._shouldContinue(isJobWaitingWithBlockNumber))) {
            this._warn('Job stopped mid-indexing (#2)')
            return
        }
        
        // New contracts deployed this block.
        const contracts = extractNewContractDeploymentsFromTraces(traces)
        contracts.length && this._info(`Got ${contracts.length} new contracts.`)

        // Tell the caller we've fetched all primitive data models.
        this.didFetchPrimitives = true

        // Separate out the logs and traces that actually succeeded.
        const txSuccess = {}
        for (const tx of transactions) {
            txSuccess[tx.hash] = tx.status != EvmTransactionStatus.Failure
        }
        this.successfulLogs = logs
            .filter(log => txSuccess[log.transactionHash])
            .sort((a, b) => (a.transactionIndex - b.transactionIndex) || (a.logIndex - b.logIndex)
        )
        this.successfulTraces = traces.filter(t => t.status !== EvmTraceStatus.Failure)

        // Decode contract function calls and events.
        const decoded = await this._decodePrimivites(transactions, traces, logs)
        transactions = decoded.transactions
        traces = decoded.traces
        logs = decoded.logs

        // New ERC-20 tokens & NFT collections.
        const newTokens = await resolveNewTokenContracts(contracts, this.chainId)
        const [erc20Tokens, nftCollections] = newTokens
        erc20Tokens.length && this._info(`${erc20Tokens.length} new ERC-20 tokens.`)
        nftCollections.length && this._info(`${nftCollections.length} new NFT collections.`)

        // Quick re-org check #3.
        if (!(await this._shouldContinue(isJobWaitingWithBlockNumber))) {
            this._warn('Job stopped mid-indexing (#3).')
            return
        }
        
        // Index token data, including transfers and balances.
        const {
            tokenTransfers,
            erc20Balances,
            erc20TotalSupplyUpdates,
        } = await this._indexTokenData(erc20Tokens, nftCollections, block)
        tokenTransfers.length && this._info(`${tokenTransfers.length} token transfers.`)
        erc20Balances.length && this._info(`${erc20Balances.length} new ERC-20 balances.`)

        // Quick re-org check #4.
        if (!(await this._shouldContinue(isJobWaitingWithBlockNumber))) {
            this._warn('Job stopped mid-indexing (#4)')
            return
        }

        // One last check before saving primitives / publishing events.
        if (await this._alreadyIndexedBlock()) {
            await this._forceRollback()
            return
        }

        // All indexed primitive data.
        const primitives = {
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
        }
        
        // If indexing over a range, just return the data instead of saving it.
        if (config.IS_RANGE_MODE) {
            return {
                ...primitives,
                pgBlockTimestamp: this.pgBlockTimestamp,
            }
        }

        // Save primitives to shared tables.
        await this._savePrimitives(primitives)

        // Curate contract events & calls for the next pipeline service.
        try {
            await this._curateInputsToSendDownstream()
            await this._sendInputsDownstream()
        } catch (err) {
            this._error('Failed to send inputs downstream:', err)
        }

        this.tf = performance.now()
        this._info(chalk.cyanBright(
            `Successfully indexed block ${this.blockNumber} ${chalk.dim(`(${this.elapsedTime}s)`)}`
        ))
    }

    async _savePrimitives(data: {
        block: EvmBlock,
        transactions: EvmTransaction[],
        logs: EvmLog[],
        traces: EvmTrace[],
        contracts: EvmContract[],
        erc20Tokens: Erc20Token[],
        erc20Balances: Erc20Balance[],
        nftCollections: NftCollection[],
        tokenTransfers: TokenTransfer[],
        erc20TotalSupplyUpdates: StringKeyMap[],
    }) {
        this._info('Saving primitives...')
        this.saving = true

        let attempt = 1
        while (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK) {
            try {
                await SharedTables.manager.transaction(async (tx) => {
                    await Promise.all([
                        this._upsertBlock(data.block, tx),
                        this._upsertTransactions(data.transactions, tx),
                        this._upsertLogs(data.logs, tx),
                        this._upsertTraces(data.traces, tx),
                        this._upsertContracts(data.contracts, tx),
                        this._upsertErc20Tokens(data.erc20Tokens, tx),
                        this._upsertErc20Balances(data.erc20Balances, tx),
                        this._upsertNftCollections(data.nftCollections, tx),
                        this._upsertTokenTransfers(data.tokenTransfers, tx),
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
        data.erc20TotalSupplyUpdates.length && await this._bulkUpdateErc20TokensTotalSupply(
            data.erc20TotalSupplyUpdates,
            this.block.timestamp.toISOString(),
        )
    }

    async _curateInputsToSendDownstream() {
        const eventOrigin = {
            chainId: this.chainId,
            blockNumber: this.blockNumber,
            blockHash: this.blockHash,
            blockTimestamp: this.block.timestamp.toISOString(),
        }

        // <chain>.NewBlock
        const originEventInputs = [
            originEvents.chain.NewBlock(this.block, eventOrigin),
        ]

        // <chain>.NewTransactions
        this.transactions?.length && originEventInputs.push(
            ...(toChunks(this.transactions, config.MAX_EVENTS_LENGTH).map(txs => 
                originEvents.chain.NewTransactions(txs, eventOrigin)
            ))
        )

        // tokens.NewTokenTransfers
        this.tokenTransfers?.length && originEventInputs.push(
            ...(toChunks(this.tokenTransfers, config.MAX_EVENTS_LENGTH).map(transfers => 
                originEvents.tokens.NewTokenTransfers(transfers, eventOrigin)
            ))
        )

        // tokens.NewErc20Balances
        this.erc20Balances?.length && originEventInputs.push(
            ...(toChunks(this.erc20Balances, config.MAX_EVENTS_LENGTH).map(balances => 
                originEvents.tokens.NewErc20Balances(balances, eventOrigin)
            ))
        )

        const decodedLogs = this.successfulLogs.filter(l => !!l.eventName)
        const decodedTraceCalls = this.successfulTraces.filter(t => (
            !!t.functionName && !!t.to && t.traceType === EvmTraceType.Call
        ))

        const logContractAddresses = new Set(decodedLogs.map(l => l.address))
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
        )
        const namespacedContractGroupAbis = {}
        for (const contractGroup in contractGroupAbis) {
            const abi = contractGroupAbis[contractGroup]
            const key = [this.contractEventNsp, contractGroup].join('.')
            namespacedContractGroupAbis[key] = abi
        }

        const txMap = mapByKey(this.transactions || [], 'hash')

        const [eventInputs, callInputs] = await Promise.all([
            this._curateContractEventInputs(
                decodedLogs,
                eventContractInstances,
                namespacedContractGroupAbis,
                txMap
            ),
            this._curateContractCallInputs(
                decodedTraceCalls,
                callContractInstances,
                namespacedContractGroupAbis,
                txMap,
            ),
        ])

        this.blockEvents = [...eventInputs, ...originEventInputs]
        this.blockCalls = callInputs
    }

    async _indexTokenData(
        erc20Tokens: Erc20Token[], 
        nftCollections: NftCollection[], 
        block: EvmBlock,
    ): Promise<{
        tokenTransfers: TokenTransfer[]
        erc20TotalSupplyUpdates: StringKeyMap[]
        erc20Balances: Erc20Balance[]
    }> {
        if (config.IS_RANGE_MODE || !this.indexTokenTransfers) {
            return { tokenTransfers: [], erc20TotalSupplyUpdates: [], erc20Balances: [] }
        }

        // All token transfers.
        const [tokenTransfers, erc20TotalSupplyUpdates, referencedErc20TokensMap] = await initTokenTransfers(
            erc20Tokens,
            nftCollections,
            this.successfulLogs,
            this.successfulTraces,
            this.chainId,
        )

        if (!this.indexTokenBalances) {
            return { tokenTransfers, erc20TotalSupplyUpdates, erc20Balances: [] }
        }
        
        // All new token balances.
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

        return { tokenTransfers, erc20TotalSupplyUpdates, erc20Balances }
    }

    async _decodePrimivites(
        transactions: EvmTransaction[], 
        traces: EvmTrace[], 
        logs: EvmLog[],
    ): Promise<{
        transactions: EvmTransaction[], 
        traces: EvmTrace[], 
        logs: EvmLog[],
    }> {
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

        return { transactions, traces, logs }
    }

    _decodeTransactions(
        transactions: EvmTransaction[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): EvmTransaction[] {
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
        tx: EvmTransaction,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): EvmTransaction {
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
        traces: EvmTrace[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): EvmTrace[] {
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
        trace: EvmTrace,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): EvmTrace {
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
            const values = web3Decoder.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
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

    _decodeLogs(logs: EvmLog[], abis: { [key: string]: Abi }): EvmLog[] {
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

    _decodeLog(log: EvmLog, abi: Abi): EvmLog {
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

        const decodedArgs = web3Decoder.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
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

    _tryDecodingLogAsTransfer(log: EvmLog): EvmLog {
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

    async _getBlockWithTransactions(): Promise<{
        block: EvmBlock,
        transactions: EvmTransaction[]
    }> {
        const { block, transactions, unixTimestamp } = await getWeb3().getBlock(
            this.givenBlockHash,
            this.blockNumber,
            this.chainId,
        )

        this.resolvedBlockHash = block.hash
        this.blockUnixTimestamp = unixTimestamp
        
        return { block, transactions }
    }

    async _getLogsOrBlockReceipts(hasTxs: boolean): Promise<{
        logs?: EvmLog[] | null,
        receipts?: ExternalEvmReceipt[] | null,
    }> {
        // Just get logs directly if you can't get block receipts.
        if (!this.canGetBlockReceipts) {
            const logs = await getWeb3().getLogs(
                this.resolvedBlockHash,
                this.blockNumber,
                this.chainId    
            )
            return { receipts: null, logs }
        } 

        let receipts = await this._getBlockReceipts()

        // Iterate until receipts can be fetched if at least 1 transaction exists.
        if (hasTxs && !receipts.length) {
            this._warn(`Transactions exist but no receipts were found -- retrying`)
            receipts = await this._waitAndRefetchReceipts(hasTxs)
            if (!receipts.length) throw `Failed to fetch receipts when transactions clearly exist.`
        }

        // Must've just been no transactions.
        if (!receipts.length) {
            return { receipts, logs: null }
        }

        // Switch back to fetching ONLY logs if multiple block hashes exist within the receipts call.
        const numBlockHashes = new Set(receipts.map(r => r.blockHash))
        if (numBlockHashes.size > 1 || receipts[0].blockHash !== this.resolvedBlockHash) {
            const logs = await getWeb3().getLogs(
                this.resolvedBlockHash,
                this.blockNumber,
                this.chainId    
            )
            return { receipts: null, logs }
        }

        return { receipts, logs: null }
    }

    async _waitAndRefetchReceipts(hasTxs: boolean): Promise<ExternalEvmReceipt[] | null> {
        const getReceipts = async () => {
            const receipts = await this._getBlockReceipts()

            // Hash mismatch.
            if (receipts.length && receipts[0].blockHash !== this.resolvedBlockHash) {
                return null
            }
            // Missing logs.
            else if (!receipts.length && hasTxs) {
                return null
            }
            // We gucci :)
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

    async _getBlockReceipts(): Promise<ExternalEvmReceipt[]> {
        return getWeb3().getBlockReceipts(
            this.resolvedBlockHash,
            this.blockNumber,
            this.chainId,
        )
    }

    async _getTraces(): Promise<EvmTrace[]> {
        if (!this.indexTraces) return []
        return getWeb3().getTraces(
            this.resolvedBlockHash,
            this.blockNumber,
            this.chainId
        )    
    }

    _initLogsWithReceipts(receipts: ExternalEvmReceipt[], block: EvmBlock): EvmLog[] {
        let logs = []
        for (const receipt of receipts) {
            for (const log of receipt.logs) {
                logs.push(externalToInternalLog(log, block))
            }
        }
        return logs
    }

    _enrichTransactionsWithReceipts(
        transactions: EvmTransaction[],
        receipts: ExternalEvmReceipt[],
    ) {
        const receiptsMap = mapByKey(receipts || [], 'transactionHash')
        for (const transaction of transactions) {
            const receipt = receiptsMap[transaction.hash]
            if (!receipt) continue
            transaction.contractAddress = normalizeEthAddress(receipt?.contractAddress)
            transaction.status = hexToNumber(receipt?.status)
            transaction.root = normalize32ByteHash(receipt?.root)
            transaction.gasUsed = hexToNumberString(receipt?.gasUsed)
            transaction.cumulativeGasUsed = hexToNumberString(receipt?.cumulativeGasUsed)
            transaction.effectiveGasPrice = hexToNumberString(receipt?.effectiveGasPrice)
        }
    }

    _enrichLogsWithBlock(logs: EvmLog[], block: EvmBlock) {
        for (const log of logs) {
            log.blockHash = block.hash
            log.blockNumber = block.number
            log.blockTimestamp = block.timestamp        
        }
    }

    _enrichTracesWithBlock(traces: EvmTrace[], block: EvmBlock) {
        for (const trace of traces) {
            trace.blockHash = block.hash
            trace.blockNumber = block.number
            trace.blockTimestamp = block.timestamp     
            
            // Hack fix only for ethereum, where the "trace_index" 
            // column was originally created as a smallint.
            if (this.chainId === chainIds.ETHEREUM && trace.traceIndex > 32767) {
                trace.traceIndex = -1
            }
        }
    }

    _enrichErc20Balances(erc20Balances: Erc20Balance[], block: EvmBlock): Erc20Balance[] {
        return erc20Balances.map(b => ({
            ...b,
            blockNumber: block.number,
            blockHash: block.hash,
            blockTimestamp: block.timestamp,
            chainId: this.chainId,
        }))
    }

    _logNewHead() {
        console.log('')
        config.IS_RANGE_MODE ||
            logger.info(
                `${this.logPrefix} Indexing block ${this.blockNumber} (${this.givenBlockHash?.slice(0, 10) || null})...`
            )

        if (this.head.replace) {
            this._info(
                chalk.magenta(`REORG: Replacing block ${this.blockNumber} with (${this.givenBlockHash?.slice(0, 10)})...`)
            )
        }
    }

    async _sendInputsDownstream() {
        if (!(await this._shouldContinue())) {
            this._info(chalk.yellow('Job stopped mid-indexing inside _sendInputsDownstream.'))
            return
        }

        await Promise.all([
            saveBlockEvents(this.chainId, this.blockNumber, this.blockEvents),
            saveBlockCalls(this.chainId, this.blockNumber, this.blockCalls),
        ])

        await reportBlockEvents(this.blockNumber)
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

    async _curateContractEventInputs(
        decodedLogs: StringKeyMap[], 
        contractInstances: ContractInstance[],
        namespacedContractGroupAbis: { [key: string]: Abi },
        txMap: { [key: string]: EvmTransaction },
    ): Promise<StringKeyMap[]> {
        const contractGroupsHoldingAddress = {}
        for (const contractInstance of contractInstances) {
            const address = contractInstance.address
            const nsp = contractInstance.contract?.namespace?.name
            const contractGroupAbi = namespacedContractGroupAbis[nsp]
            if (!contractGroupAbi) continue
        
            contractGroupsHoldingAddress[address] = contractGroupsHoldingAddress[address] || []
            contractGroupsHoldingAddress[address].push({
                nsp,
                contractGroupAbi,
                contractInstanceName: contractInstance.name,
            })
        }
        if (!Object.keys(contractGroupsHoldingAddress).length) return []

        const eventSpecs = []
        for (const decodedLog of decodedLogs) {
            const { eventName, topic0, address } = decodedLog
            const contractGroups = contractGroupsHoldingAddress[address] || []
            if (!contractGroups.length) continue

            for (const { nsp, contractGroupAbi, contractInstanceName } of contractGroups) {
                const formattedEventData = formatLogAsSpecEvent(
                    decodedLog,
                    contractGroupAbi,
                    contractInstanceName,
                    this.chainId,
                    txMap[decodedLog.transactionHash],
                )
                if (!formattedEventData) continue
                const { eventOrigin, data } = formattedEventData
                eventSpecs.push({
                    origin: eventOrigin,
                    name: toNamespacedVersion(nsp, eventName, topic0),
                    data,
                })    
            }
        }
        return eventSpecs
    }

    async _curateContractCallInputs(
        decodedTraceCalls: StringKeyMap[], 
        contractInstances: ContractInstance[],
        namespacedContractGroupAbis: { [key: string]: Abi },
        txMap: { [key: string]: EvmTransaction },
    ): Promise<StringKeyMap[]> {
        const contractGroupsHoldingAddress = {}
        for (const contractInstance of contractInstances) {
            const address = contractInstance.address
            const nsp = contractInstance.contract?.namespace?.name
            const contractGroupAbi = namespacedContractGroupAbis[nsp]
            if (!contractGroupAbi) continue
        
            contractGroupsHoldingAddress[address] = contractGroupsHoldingAddress[address] || []
            contractGroupsHoldingAddress[address].push({
                nsp,
                contractGroupAbi,
                contractInstanceName: contractInstance.name,
            })
        }
        if (!Object.keys(contractGroupsHoldingAddress).length) return []

        const callSpecs = []
        for (const decodedTrace of decodedTraceCalls) {
            const { functionName, input, to } = decodedTrace
            const signature = input?.slice(0, 10)
            const contractGroups = contractGroupsHoldingAddress[to] || []
            if (!contractGroups.length) continue

            for (const { nsp, contractGroupAbi, contractInstanceName } of contractGroups) {
                const formattedCallData = formatTraceAsSpecCall(
                    decodedTrace, 
                    signature,
                    contractGroupAbi,
                    contractInstanceName,
                    this.chainId,
                    txMap[decodedTrace.transactionHash],
                )
                if (!formattedCallData) continue
                const { 
                    callOrigin,
                    inputs,
                    inputArgs,
                    outputs,
                    outputArgs,
                } = formattedCallData
                callSpecs.push({
                    origin: callOrigin,
                    name: toNamespacedVersion(nsp, functionName, signature),
                    inputs,
                    inputArgs,
                    outputs,
                    outputArgs,
                })
            }
        }
        return callSpecs
    }

    async _upsertBlock(block: EvmBlock, tx: any) {
        const [updateCols, conflictCols] = fullEvmBlockUpsertConfig(block)
        const blockTimestamp = this.pgBlockTimestamp
        this.block =
            (
                await tx
                    .createQueryBuilder()
                    .insert()
                    .into(EvmBlock)
                    .values({ ...block, timestamp: () => blockTimestamp })
                    .orUpdate(updateCols, conflictCols)
                    .returning('*')
                    .execute()
            ).generatedMaps[0] || null
    }

    async _upsertTransactions(transactions: EvmTransaction[], tx: any) {
        if (!transactions.length) return
        const [updateCols, conflictCols] = fullEvmTransactionUpsertConfig(transactions[0])
        const blockTimestamp = this.pgBlockTimestamp
        transactions = uniqueByKeys(transactions, conflictCols) as EvmTransaction[]
        this.transactions = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(EvmTransaction)
                .values(transactions.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps || []
    }

    async _upsertLogs(logs: EvmLog[], tx: any) {
        if (!logs.length) return
        const [updateCols, conflictCols] = fullEvmLogUpsertConfig(logs[0])
        const blockTimestamp = this.pgBlockTimestamp
        logs = uniqueByKeys(logs, ['logIndex', 'transactionHash']) as EvmLog[]
        this.logs = (
            await Promise.all(
                toChunks(logs, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(EvmLog)
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

    async _upsertTraces(traces: EvmTrace[], tx: any) {
        if (!traces.length) return
        const [updateCols, conflictCols] = fullEvmTraceUpsertConfig(traces[0])
        const blockTimestamp = this.pgBlockTimestamp
        traces = uniqueByKeys(traces, conflictCols) as EvmTrace[]
        this.traces = (
            await Promise.all(
                toChunks(traces, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(EvmTrace)
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

    async _upsertContracts(contracts: EvmContract[], tx: any) {
        if (!contracts.length) return
        const [updateCols, conflictCols] = fullEvmContractUpsertConfig(contracts[0])
        const blockTimestamp = this.pgBlockTimestamp
        contracts = uniqueByKeys(contracts, conflictCols) as EvmContract[]
        this.contracts = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(EvmContract)
                .values(contracts.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps || []
    }

    async _upsertErc20Tokens(erc20Tokens: Erc20Token[], tx: any) {
        if (!erc20Tokens.length) return
        const [updateCols, conflictCols] = fullErc20TokenUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."erc20_tokens"."last_updated" < excluded.last_updated`
        const blockTimestamp = this.pgBlockTimestamp
        erc20Tokens = uniqueByKeys(erc20Tokens, conflictCols.map(snakeToCamel)) as Erc20Token[]

        this.erc20Tokens = ((
            await tx
                .createQueryBuilder()
                .insert()
                .into(Erc20Token)
                .values(erc20Tokens.map((c) => ({ 
                    ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .onConflict(
                    `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                )
                .returning('*')
                .execute()
        ).generatedMaps || []).filter(t => t && !!Object.keys(t).length) as Erc20Token[]
    }

    async _upsertErc20Balances(erc20Balances: Erc20Balance[], tx: any) {
        if (!erc20Balances.length) return
        const [updateCols, conflictCols] = fullErc20BalanceUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."erc20_balance"."block_timestamp" < excluded.block_timestamp and "tokens"."erc20_balance"."balance" != excluded.balance`
        const blockTimestamp = this.pgBlockTimestamp
        erc20Balances = uniqueByKeys(erc20Balances, conflictCols.map(snakeToCamel)) as Erc20Balance[]
        this.erc20Balances = (
            await Promise.all(
                toChunks(erc20Balances, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(Erc20Balance)
                        .values(chunk.map((b) => ({ 
                            ...b, 
                            blockTimestamp: () => blockTimestamp,
                        })))
                        .onConflict(
                            `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                        )
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => (result.generatedMaps || []).filter(t => t && !!Object.keys(t).length))
            .flat() as Erc20Balance[]
    }
    
    async _upsertNftCollections(nftCollections: NftCollection[], tx: any) {
        if (!nftCollections.length) return
        const [updateCols, conflictCols] = fullNftCollectionUpsertConfig()
        const conflictColStatement = conflictCols.map(ident).join(', ')
        const updateColsStatement = updateCols.map(colName => `${ident(colName)} = excluded.${colName}`).join(', ')
        const whereClause = `"tokens"."nft_collections"."last_updated" < excluded.last_updated`
        const blockTimestamp = this.pgBlockTimestamp
        nftCollections = uniqueByKeys(nftCollections, conflictCols.map(snakeToCamel)) as NftCollection[]
        this.nftCollections = ((
            await tx
                .createQueryBuilder()
                .insert()
                .into(NftCollection)
                .values(nftCollections.map((c) => ({ ...c, 
                    blockTimestamp: () => blockTimestamp,
                    lastUpdated: () => blockTimestamp
                })))
                .onConflict(
                    `(${conflictColStatement}) DO UPDATE SET ${updateColsStatement} WHERE ${whereClause}`,
                )
                .returning('*')
                .execute()
        ).generatedMaps || []).filter(n => n && !!Object.keys(n).length) as NftCollection[]
    }

    async _upsertTokenTransfers(tokenTransfers: TokenTransfer[], tx: any) {
        if (!tokenTransfers.length) return
        const [updateCols, conflictCols] = fullTokenTransferUpsertConfig()
        const blockTimestamp = this.pgBlockTimestamp
        tokenTransfers = uniqueByKeys(tokenTransfers, conflictCols.map(snakeToCamel)) as TokenTransfer[]
        this.tokenTransfers = (
            await Promise.all(
                toChunks(tokenTransfers, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(TokenTransfer)
                        .values(chunk.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
                        .orUpdate(updateCols, conflictCols)
                        .returning('*')
                        .execute()
                })
            )
        )
            .map((result) => result.generatedMaps || [])
            .flat() as TokenTransfer[]
    }

    async _bulkUpdateErc20TokensTotalSupply(updates: StringKeyMap[], timestamp: string, attempt: number = 1) {
        if (!updates.length) return
        const tempTableName = `erc20_tokens_${short.generate()}`
        const insertPlaceholders = []
        const insertBindings = []
        let i = 1
        for (const { id, totalSupply } of updates) {
            insertPlaceholders.push(`($${i}, $${i + 1}, $${i + 2})`)
            insertBindings.push(...[id, totalSupply, timestamp])
            i += 3
        }
        
        let error
        const client = await this.pool.connect()
        try {
            // Create temp table and insert updates + primary key data.
            await client.query('BEGIN')
            await client.query(
                `CREATE TEMP TABLE ${tempTableName} (id integer primary key, total_supply character varying, last_updated timestamp with time zone) ON COMMIT DROP`
            )

            // Bulk insert the updated records to the temp table.
            await client.query(`INSERT INTO ${tempTableName} (id, total_supply, last_updated) VALUES ${insertPlaceholders.join(', ')}`, insertBindings)

            // Merge the temp table updates into the target table ("bulk update").
            await client.query(
                `UPDATE tokens.erc20_tokens SET total_supply = ${tempTableName}.total_supply, last_updated = ${tempTableName}.last_updated FROM ${tempTableName} WHERE tokens.erc20_tokens.id = ${tempTableName}.id and tokens.erc20_tokens.last_updated < ${tempTableName}.last_updated`
            )
            await client.query('COMMIT')
        } catch (err) {
            await client.query('ROLLBACK')
            this._error(`Error bulk updating ERC-20 Tokens`, updates, err)
            error = err
        } finally {
            client.release()
        }
        if (!error) return

        const message = error.message || error.toString() || ''
        if (attempt <= config.MAX_ATTEMPTS_DUE_TO_DEADLOCK && message.toLowerCase().includes('deadlock')) {
            this._error(`Got deadlock ("tokens"."erc20_tokens"). Retrying...(${attempt}/${config.MAX_ATTEMPTS_DUE_TO_DEADLOCK})`)
            await sleep(randomIntegerInRange(50, 500))
            return await this._bulkUpdateErc20TokensTotalSupply(updates, timestamp, attempt + 1)
        }
        
        throw error
    }

    async _alreadyIndexedBlock(): Promise<boolean> {
        if (config.IS_RANGE_MODE || this.head.force) return false
        return this._blockAlreadyExists(currentChainSchema())
    }

    async _blockAlreadyExists(schema: string): Promise<boolean> {
        try {
            const rows = await SharedTables.query(
                `select timestamp from ${schema}.blocks where number = $1`,
                [this.blockNumber]
            )
            if (rows.length) {
                this.existingBlockTimestamp = rows[0].timestamp
                return true    
            }
        } catch (err) {
            this._error(err)
        }
        return false
    }

    async _forceRollback() {
        if (this.head.fillingGap) {
            this._warn('Block already indexed. Stopping.')
            return
        }

        this._notify('Current block was already indexed. Forcing rollback.')

        let unixTimestamp
        if (this.blockUnixTimestamp) {
            unixTimestamp = this.blockUnixTimestamp
        } else if (this.existingBlockTimestamp) {
            unixTimestamp = Math.floor(new Date(this.existingBlockTimestamp).valueOf() / 1000)
        } else {
            unixTimestamp = Math.floor(Date.now() / 1000)
        }
        
        await publishForcedRollback(
            this.chainId, 
            this.blockNumber, 
            this.blockHash,
            unixTimestamp
        )
    }

    /**
     * Checks to see if this service should continue or if there was a re-org 
     * back to a previous block number -- in which case everything should stop.
     */
    async _shouldContinue(isJobWaitingWithBlockNumber?: Function): Promise<boolean> {
        if (this.timedOut) {
            this._warn(`Job timed out.`)
            return false
        }
        if (config.IS_RANGE_MODE || this.head.force) return true

        if (isJobWaitingWithBlockNumber && (await isJobWaitingWithBlockNumber(this.blockNumber))) {
            this._warn(`Replacement job already waiting. Stopping this one.`)
            return false
        }

        return await canBlockBeOperatedOn(this.chainId, this.blockNumber)
    }

    async _info(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.info(`${this.logPrefix} ${msg}`, ...args)
    }

    async _notify(msg: any, ...args: any[]) {
        config.IS_RANGE_MODE || logger.notify(`${this.logPrefix} ${msg}`, ...args)
    }

    async _warn(msg: any, ...args: any[]) {
        logger.warn(`${this.logPrefix} ${chalk.yellow(msg)}`, ...args)
    }

    async _error(msg: any, ...args: any[]) {
        logger.error(`${this.logPrefix} ${chalk.red(msg)}`, ...args)
    }
}

export default EvmIndexer