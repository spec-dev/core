import AbstractIndexer from '../AbstractIndexer'
import Web3 from 'web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import config from '../../config'
import { resolveNewTokenContracts } from '../../services/contractServices'
import { originEvents } from '../../events'
import chalk from 'chalk'
import { ExternalPolygonTransaction, ExternalPolygonReceipt, ExternalPolygonBlock } from './types'
import {
    sleep,
    PolygonBlock,
    PolygonLog,
    NewReportedHead,
    SharedTables,
    PolygonTransaction,
    fullPolygonBlockUpsertConfig,
    fullPolygonLogUpsertConfig,
    fullPolygonTransactionUpsertConfig,
    fullPolygonTraceUpsertConfig,
    fullPolygonContractUpsertConfig,
    StringKeyMap,
    toChunks,
    getAbis,
    ensureNamesExistOnAbiInputs,
    groupAbiInputsWithValues,
    getFunctionSignatures,
    Abi,
    AbiItem,
    formatAbiValueWithType,
    PolygonTransactionStatus,
    uniqueByKeys,
    schemas,
    randomIntegerInRange,
    unique,
    PolygonTrace,
    PolygonContract,
    Erc20Token,
    NftCollection,
    PolygonTraceStatus,
    PolygonTraceType,
    TRANSFER_TOPIC,
    TRANSFER_SINGLE_TOPIC,
    TRANSFER_BATCH_TOPIC,
    TRANSFER_EVENT_NAME,
    TRANSFER_SINGLE_EVENT_NAME,
    TRANSFER_BATCH_EVENT_NAME,
    getContractGroupAbis,
} from '../../../../shared'
import extractTransfersFromLogs from '../../services/extractTransfersFromLogs'
import resolveContracts from './services/resolveContracts'
import resolveBlockTraces from './services/resolveBlockTraces'
import getContracts from './services/getContracts'
import { getERC20TokenBalance, getERC1155TokenBalance } from '../../services/contractServices'
import { 
    decodeTransferEvent, 
    decodeTransferSingleEvent, 
    decodeTransferBatchEvent,
} from '../../services/extractTransfersFromLogs'

class PolygonIndexer extends AbstractIndexer {
    
    web3: Web3

    block: PolygonBlock = null

    transactions: PolygonTransaction[] = []

    logs: PolygonLog[] = []

    traces: PolygonTrace[] = []

    contracts: PolygonContract[] = []

    successfulLogs: PolygonLog[] = []

    ivySmartWalletInitializerWalletCreated: string // hack

    constructor(head: NewReportedHead, web3?: Web3) {
        super(head)
        this.web3 = web3 || new Web3(config.RPC_REST_URL)
        this.ivySmartWalletInitializerWalletCreated = `${this.contractEventNsp}.ivy.SmartWalletInitializer.WalletCreated@0x5b03bfed1c14a02bdeceb5fa582eb1a5765fc0bc64ca0e6af4c20afc9487f081`
    }

    async perform(): Promise<StringKeyMap | void> {
        super.perform()

        if (await this._alreadyIndexedBlock()) {
            this._warn('Current block was already indexed. Stopping.')
            return
        }

        // Get blocks (+transactions), receipts (+logs).
        const blockPromise = this._getBlockWithTransactions()
        const receiptsPromise = this._getBlockReceiptsWithLogs()

        // Ensure this.blockHash is set before fetching traces. 
        // We need this for formatting & setting of primary id.
        let tracesPromise = null
        if (this.blockHash) {
            tracesPromise = this._getTraces()
        }

        // Wait for block and receipt promises to resolve (we need them for transactions and logs, respectively).
        let [blockResult, receipts] = await Promise.all([blockPromise, receiptsPromise])
        const [externalBlock, block] = blockResult
        this.resolvedBlockHash = block.hash
        this.blockUnixTimestamp = externalBlock.timestamp

        if (tracesPromise === null) {
            tracesPromise = this._getTraces()
        }

        // Quick re-org check.
        if (!(await this._shouldContinue())) {
            this._warn('Job stopped mid-indexing.')
            return
        }

        // Convert external block transactions into our custom external eth transaction type.
        const externalTransactions = externalBlock.transactions.map(
            (t) => t as unknown as ExternalPolygonTransaction
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
        // Initialize our internal models for both transactions and logs.
        let transactions = externalTransactions.length
            ? initTransactions(block, externalTransactions, receipts)
            : []
        let logs = receipts?.length ? initLogs(block, receipts) : []

        // Wait for traces to resolve and ensure there's not block hash mismatch.
        let traces = await tracesPromise
        if (traces.length && traces[0].blockHash !== block.hash) {
            this._warn(
                `Hash mismatch with traces: ${traces[0].blockHash} vs ${block.hash} -- refetching until equivalent.`
            )
            traces = await this._waitAndRefetchTraces(block.hash)
        }
        traces = this._enrichTraces(traces, block)

        // Get all abis for addresses needed to decode both transactions and logs.
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

        // Decode transactions and logs.
        transactions = transactions.length && (numAbis || numFunctionSigs) 
            ? this._decodeTransactions(transactions, abis, functionSignatures) 
            : transactions
        traces = traces.length && (numAbis || numFunctionSigs) 
            ? this._decodeTraces(traces, abis, functionSignatures) 
            : traces
        logs = logs.length ? this._decodeLogs(logs, abis) : logs

        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts || [], traces)

        // Get any new contracts deployed this block.
        const contracts = getContracts(traces)
        contracts.length && this._info(`Got ${contracts.length} new contracts.`)
        
        // New token contracts.
        const [erc20Tokens, nftCollections] = await resolveNewTokenContracts(contracts, this.chainId)
        erc20Tokens.length && this._info(`${erc20Tokens.length} new ERC-20 tokens.`)
        nftCollections.length && this._info(`${nftCollections.length} new NFT collections.`)

        // One last check before saving.
        if (!(await this._shouldContinue())) {
            this._warn('Job stopped mid-indexing, pre-save.')
            return
        }

        // One last check before saving primitives / publishing events.
        if (await this._alreadyIndexedBlock()) {
            this._warn('Current block was already indexed. Stopping.')
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
            nftCollections,
        )

        // Curate list of logs from transactions that succeeded.
        this._curateSuccessfulLogs()

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
            && (await this._blockAlreadyExists(schemas.polygon()))
    }

    async _savePrimitives(
        block: PolygonBlock,
        transactions: PolygonTransaction[],
        logs: PolygonLog[],
        traces: PolygonTrace[],
        contracts: PolygonContract[],
        erc20Tokens: Erc20Token[],
        nftCollections: NftCollection[],
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
                        this._upsertNftCollections(nftCollections, tx),
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
    }

    async _createAndPublishEvents() {
        // Decode contract events and function calls.
        const decodedLogs = this.successfulLogs.filter(l => !!l.eventName)
        const logContractAddresses = new Set(decodedLogs.map(l => l.address))

        const decodedTraceCalls = this.traces.filter(t => (
            t.status !== PolygonTraceStatus.Failure && !!t.functionName && !!t.to && t.traceType === PolygonTraceType.Call
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

        // New Ivy Smart Wallet events.
        const ivySmartWalletInitializerWalletCreatedEventSpecs = contractEventSpecs.filter(es => (
            es.name === this.ivySmartWalletInitializerWalletCreated
        ))
        let newSmartWalletEventSpecs = []
        if (ivySmartWalletInitializerWalletCreatedEventSpecs.length) {
            newSmartWalletEventSpecs = (await Promise.all(
                ivySmartWalletInitializerWalletCreatedEventSpecs.map(es => originEvents.ivy.NewSmartWallet(es))
            )).filter(v => !!v)
        }

        const tokenEventSpecs = await this._getNewTokenBalanceEventSpecs()

        // ERC-20 Balance events.
        const erc20EventSpecs = (await Promise.all(
            (tokenEventSpecs?.erc20s || []).map(es => originEvents.tokens.NewERC20TokenBalance(es))
        )).filter(v => !!v)

        // NFT Balance events.
        const nftEventSpecs = (await Promise.all(
            (tokenEventSpecs?.nfts || []).map(es => originEvents.tokens.NewNFTBalance(es))
        )).filter(v => !!v)

        // Publish to Spec's event network.
        const allEventSpecs = [
            ...contractEventSpecs,
            ...newSmartWalletEventSpecs,
            ...erc20EventSpecs,
            ...nftEventSpecs,
        ]
        await this._kickBlockDownstream(allEventSpecs, contractCallSpecs)
    }
    
    async _getNewTokenBalanceEventSpecs(): Promise<StringKeyMap> {
        const transfers = extractTransfersFromLogs(this.successfulLogs)
        if (!transfers.length) return {}

        const accounts = []
        for (const transfer of transfers) {
            transfer.from && accounts.push(transfer.from)
            transfer.to && accounts.push(transfer.to)
        }

        const referencedSmartWalletOwners = await this._getSmartWalletsForAddresses(unique(accounts))
        if (!referencedSmartWalletOwners.length) return {}
        const smartWalletOwners = new Set(referencedSmartWalletOwners)
        
        const referencedContractAddresses = unique(transfers.map(t => t.log.address))
        const contracts = await resolveContracts(referencedContractAddresses, this.chainId)

        const refetchERC20TokenBalancesMap = {}
        const erc721BalanceUpdates = {}
        const refetchERC1155TokenBalancesMap = {}

        const transferToLog = {}
        for (const transfer of transfers) {
            const contract = contracts[transfer.log.address]
            if (!contract) continue

            if (contract.isERC20) {
                const token = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                    decimals: contract.decimals || null,
                }
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
    
                if (fromSmartWalletOwner) {
                    const key = [contract.address, transfer.from].join(':')
                    refetchERC20TokenBalancesMap[key] = token
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, transfer.to].join(':')
                    refetchERC20TokenBalancesMap[key] = token
                    transferToLog[key] = transfer.log
                }
            }
            else if (contract.isERC721) {
                const nftContract = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                }
                
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
                const tokenId = transfer.value
                
                if (fromSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.from].join(':')
                    erc721BalanceUpdates[key] = {
                        ...nftContract,
                        balance: '0',
                    }
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.to].join(':')
                    erc721BalanceUpdates[key] = {
                        ...nftContract,
                        balance: '1',
                    }
                    transferToLog[key] = transfer.log
                }
            } else if (contract.isERC1155) {
                const nftContract = {
                    name: contract.name || null,
                    symbol: contract.symbol || null,
                }
                const fromSmartWalletOwner = transfer.from && smartWalletOwners.has(transfer.from)
                const toSmartWalletOwner = transfer.to && smartWalletOwners.has(transfer.to)
                const tokenId = transfer.tokenId
    
                if (fromSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.from].join(':')
                    refetchERC1155TokenBalancesMap[key] = nftContract
                    transferToLog[key] = transfer.log
                }
                if (toSmartWalletOwner) {
                    const key = [contract.address, tokenId, transfer.to].join(':')
                    refetchERC1155TokenBalancesMap[key] = nftContract
                    transferToLog[key] = transfer.log
                }
            }
        }

        const tokenBalancePromises = []
        const tokenBalanceData = []
        for (const key in refetchERC20TokenBalancesMap) {
            const token = refetchERC20TokenBalancesMap[key]
            const [tokenAddress, ownerAddress] = key.split(':')
            tokenBalancePromises.push(getERC20TokenBalance(tokenAddress, ownerAddress, token.decimals))
            tokenBalanceData.push({ 
                tokenAddress,
                tokenName: token.name,
                tokenSymbol: token.symbol,
                ownerAddress,
                log: transferToLog[key]
            })
        }

        let tokenBalances
        try {
            tokenBalances = await Promise.all(tokenBalancePromises)
        } catch (err) {
            this._error(`Error refreshing ERC-20 token balances: $${err}`)
            tokenBalances = []
        }

        for (let i = 0; i < tokenBalances.length; i++) {
            tokenBalanceData[i].balance = tokenBalances[i]
        }

        const erc721TokenBalanceData = []
        for (const key in erc721BalanceUpdates) {
            const nftContractWithBalance = erc721BalanceUpdates[key]
            const [contractAddress, tokenId, ownerAddress] = key.split(':')
            erc721TokenBalanceData.push({ 
                tokenAddress: contractAddress,
                tokenName: nftContractWithBalance.name,
                tokenSymbol: nftContractWithBalance.symbol,
                tokenStandard: 'erc721',
                tokenId,
                ownerAddress,
                balance: nftContractWithBalance.balance,
                log: transferToLog[key]
            })
        }

        const erc1155TokenBalancePromises = []
        const erc1155TokenBalanceData = []
        for (const key in refetchERC1155TokenBalancesMap) {
            const nftContract = refetchERC1155TokenBalancesMap[key]
            const [contractAddress, tokenId, ownerAddress] = key.split(':')
            erc1155TokenBalancePromises.push(getERC1155TokenBalance(contractAddress, tokenId, ownerAddress))
            erc1155TokenBalanceData.push({
                tokenAddress: contractAddress,
                tokenName: nftContract.name,
                tokenSymbol: nftContract.symbol,
                tokenStandard: 'erc1155',
                tokenId,
                ownerAddress,
                log: transferToLog[key]
            })
        }

        let erc1155TokenBalances
        try {
            erc1155TokenBalances = await Promise.all(erc1155TokenBalancePromises)
        } catch (err) {
            this._error(`Error refreshing ERC-1155 token balances: $${err}`)
            erc1155TokenBalances = []
        }

        for (let i = 0; i < erc1155TokenBalances.length; i++) {
            erc1155TokenBalanceData[i].balance = erc1155TokenBalances[i]
        }

        const erc20EventSpecs = tokenBalanceData
            .filter(entry => entry.balance !== null)
            .map(value => {
                const { tokenAddress, tokenName, tokenSymbol, ownerAddress, balance, log } = value
                return {
                    data: {
                        tokenAddress,
                        tokenName,
                        tokenSymbol,
                        ownerAddress,
                        balance,
                    },
                    origin: {
                        chainId: this.chainId,
                        transactionHash: log.transactionHash,
                        transactionIndex: log.transactionIndex,
                        logIndex: log.logIndex,
                        contractAddress: log.address,
                        blockNumber: Number(log.blockNumber),
                        blockHash: log.blockHash,
                        blockTimestamp: log.blockTimestamp.toISOString(),        
                    }
                }
            })

        const nftEventSpecs = [...erc721TokenBalanceData, ...erc1155TokenBalanceData]
            .filter(entry => entry.balance !== null)
            .map(value => {
                const { tokenAddress, tokenName, tokenSymbol, tokenStandard, tokenId, ownerAddress, balance, log } = value
                return {
                    data: {
                        tokenAddress,
                        tokenName,
                        tokenSymbol,
                        tokenStandard,
                        tokenId,
                        ownerAddress,
                        balance,
                    },
                    origin: {
                        chainId: this.chainId,
                        transactionHash: log.transactionHash,
                        transactionIndex: log.transactionIndex,
                        logIndex: log.logIndex,
                        contractAddress: log.address,
                        blockNumber: Number(log.blockNumber),
                        blockHash: log.blockHash,
                        blockTimestamp: log.blockTimestamp.toISOString(),        
                    }
                }    
            })

        return { erc20s: erc20EventSpecs, nfts: nftEventSpecs }
    }

    async _getSmartWalletsForAddresses(addresses: string[]): Promise<string[]> {
        if (!addresses.length) return []
        const placeholders = []
        let i = 1
        for (const _ of addresses) {
            placeholders.push(`$${i}`)
            i++
        }
        const results = (await SharedTables.query(
            `SELECT contract_address FROM ivy.smart_wallets WHERE contract_address IN (${placeholders.join(', ')}) AND chain_id = $${i}`,
            [...addresses, this.chainId],
        )) || []
        return results.map(sw => sw?.contract_address).filter(v => !!v)
    }

    _decodeTransactions(
        transactions: PolygonTransaction[], 
        abis: { [key: string]: Abi },
        functionSignatures: { [key: string]: AbiItem },
    ): PolygonTransaction[] {
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
        tx: PolygonTransaction,
        abi: Abi,
        functionSignatures: { [key: string]: AbiItem },
    ): PolygonTransaction {
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
            const values = this.web3.eth.abi.decodeParameters(inputsWithNames, `0x${inputData}`)
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

    _decodeLogs(logs: PolygonLog[], abis: { [key: string]: Abi }): PolygonLog[] {
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
            finalLogs.push(log)
        }
        return finalLogs
    }

    _decodeLog(log: PolygonLog, abi: Abi): PolygonLog {
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

        const decodedArgs = this.web3.eth.abi.decodeLog(abiItem.inputs as any, log.data, topics)
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

    _tryDecodingLogAsTransfer(log: PolygonLog): PolygonLog {
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

    _curateSuccessfulLogs() {
        const txSuccess = {}
        for (const tx of this.transactions) {
            txSuccess[tx.hash] = tx.status != PolygonTransactionStatus.Failure
        }
        this.successfulLogs = this.logs
            .filter(log => txSuccess[log.transactionHash])
            .sort((a, b) => (a.transactionIndex - b.transactionIndex) || (a.logIndex - b.logIndex)
        )
    }

    async _getBlockWithTransactions(): Promise<[ExternalPolygonBlock, PolygonBlock]> {
        return resolveBlock(
            this.web3,
            this.blockNumber,
            this.chainId,
        )
    }

    async _getBlockReceiptsWithLogs(): Promise<ExternalPolygonReceipt[]> {
        return getBlockReceipts(
            this.hexBlockNumber,
            this.blockNumber,
            this.chainId,
        )
    }

    async _waitAndRefetchReceipts(blockHash: string, hasTxs: boolean): Promise<ExternalPolygonReceipt[]> {
        const getReceipts = async () => {
            const receipts = await getBlockReceipts(
                this.hexBlockNumber,
                this.blockNumber,
                this.chainId,
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

    async _getTraces(): Promise<PolygonTrace[]> {
        try {
            return config.IS_RANGE_MODE 
                ? [] 
                : resolveBlockTraces(this.hexBlockNumber, this.blockNumber, this.blockHash, this.chainId)
        } catch (err) {
            throw err
        }
    }

    async _waitAndRefetchTraces(blockHash: string): Promise<PolygonTrace[]> {
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

    _enrichTraces(traces: PolygonTrace[], block: PolygonBlock): PolygonTrace[] {
        return traces.map((t, i) => {
            t.blockTimestamp = block.timestamp
            return t
        })
    }

    _ensureAllShareSameBlockHash(
        block: PolygonBlock,
        receipts: ExternalPolygonReceipt[],
        traces: PolygonTrace[],
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

    async _upsertBlock(block: PolygonBlock, tx: any) {
        const [updateCols, conflictCols] = fullPolygonBlockUpsertConfig(block)
        const blockTimestamp = this.pgBlockTimestamp
        this.block =
            (
                await tx
                    .createQueryBuilder()
                    .insert()
                    .into(PolygonBlock)
                    .values({ ...block, timestamp: () => blockTimestamp })
                    .orUpdate(updateCols, conflictCols)
                    .returning('*')
                    .execute()
            ).generatedMaps[0] || null
    }

    async _upsertTransactions(transactions: PolygonTransaction[], tx: any) {
        if (!transactions.length) return
        const [updateCols, conflictCols] = fullPolygonTransactionUpsertConfig(transactions[0])
        const blockTimestamp = this.pgBlockTimestamp
        transactions = uniqueByKeys(transactions, conflictCols) as PolygonTransaction[]
        this.transactions = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(PolygonTransaction)
                .values(transactions.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps || []
    }

    async _upsertLogs(logs: PolygonLog[], tx: any) {
        if (!logs.length) return
        const [updateCols, conflictCols] = fullPolygonLogUpsertConfig(logs[0])
        const blockTimestamp = this.pgBlockTimestamp
        logs = uniqueByKeys(logs, ['logIndex', 'transactionHash']) as PolygonLog[]
        this.logs = (
            await Promise.all(
                toChunks(logs, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(PolygonLog)
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

    async _upsertTraces(traces: PolygonTrace[], tx: any) {
        if (!traces.length) return
        const [updateCols, conflictCols] = fullPolygonTraceUpsertConfig(traces[0])
        const blockTimestamp = this.pgBlockTimestamp
        traces = uniqueByKeys(traces, conflictCols) as PolygonTrace[]
        this.traces = (
            await Promise.all(
                toChunks(traces, config.MAX_BINDINGS_SIZE).map((chunk) => {
                    return tx
                        .createQueryBuilder()
                        .insert()
                        .into(PolygonTrace)
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

    async _upsertContracts(contracts: PolygonContract[], tx: any) {
        if (!contracts.length) return
        const [updateCols, conflictCols] = fullPolygonContractUpsertConfig(contracts[0])
        const blockTimestamp = this.pgBlockTimestamp
        contracts = uniqueByKeys(contracts, conflictCols) as PolygonContract[]
        this.contracts = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(PolygonContract)
                .values(contracts.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps || []
    }
}

export default PolygonIndexer