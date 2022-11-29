import AbstractIndexer from '../AbstractIndexer'
import Web3 from 'web3'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import config from '../../config'
import { onIvyWalletCreatedContractEvent, onNewERC20TokenBalanceEvent, onNewNFTBalanceEvent } from '../../events'
import { publishEventSpecs } from '../../events/relay'
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
    StringKeyMap,
    toChunks,
    getAbis,
    getFunctionSignatures,
    abiRedisKeys,
    Abi,
    AbiItem,
    CoreDB,
    ContractInstance,
    In,
    formatAbiValueWithType,
    productionChainNameForChainId,
    PolygonTransactionStatus,
} from '../../../../shared'
import extractTransfersFromLogs from '../../services/extractTransfersFromLogs'
import resolveContracts from './services/resolveContracts'
import { getERC20TokenBalance, getERC1155TokenBalance } from '../../services/contractServices'

const web3js = new Web3()

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

const ivySmartWalletInitializerWalletCreated = 'polygon:ivy.SmartWalletInitializer.WalletCreated'

class PolygonIndexer extends AbstractIndexer {
    
    web3: AlchemyWeb3

    block: PolygonBlock = null

    transactions: PolygonTransaction[] = []

    logs: PolygonLog[] = []

    successfulLogs: PolygonLog[] = []

    constructor(head: NewReportedHead, web3?: AlchemyWeb3) {
        super(head)
        this.web3 = web3 || createAlchemyWeb3(config.ALCHEMY_REST_URL)
    }

    async perform(): Promise<StringKeyMap | void> {
        super.perform()

        // Get blocks (+transactions), receipts (+logs).
        const blockPromise = this._getBlockWithTransactions()
        const receiptsPromise = this._getBlockReceiptsWithLogs()

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
            (t) => t as unknown as ExternalPolygonTransaction
        )

        // If transactions exist, but receipts don't, try one more time to get them before erroring out.
        if (!config.IS_RANGE_MODE && externalTransactions.length && !receipts.length) {
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

        // Wait for traces to resolve and ensure there's not block hash mismatch.
        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts || [])

        // Get all abis for addresses needed to decode both transactions and logs.
        const txToAddresses = transactions.map(t => t.to).filter(v => !!v)
        const logAddresses = logs.map(l => l.address).filter(v => !!v)
        const sigs = transactions.filter(tx => !!tx.input).map(tx => tx.input.slice(0, 10))
        const [abis, functionSignatures] = await Promise.all([
            getAbis(
                Array.from(new Set([ ...txToAddresses, ...logAddresses ])),
                abiRedisKeys.POLYGON_CONTRACTS,
            ),
            getFunctionSignatures(
                Array.from(new Set(sigs)),
                abiRedisKeys.POLYGON_FUNCTION_SIGNATURES,
            ),
        ])
        const numAbis = Object.keys(abis).length
        const numFunctionSigs = Object.keys(functionSignatures).length

        // Decode transactions and logs.
        transactions = transactions.length && (numAbis || numFunctionSigs) 
            ? this._decodeTransactions(transactions, abis, functionSignatures) 
            : transactions
        logs = logs.length && numAbis ? this._decodeLogs(logs, abis) : logs

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
                pgBlockTimestamp: this.pgBlockTimestamp,
            }
        }

        // Save primitives to shared tables.
        await this._savePrimitives(block, transactions, logs)

        // Curate list of logs from transactions that succeeded.
        this._curateSuccessfulLogs()

        // Create and publish Spec events to the event relay.
        try {
            await this._createAndPublishEvents()
        } catch (err) {
            this._error('Publishing events failed:', err)
        }
    }

    async _savePrimitives(
        block: PolygonBlock,
        transactions: PolygonTransaction[],
        logs: PolygonLog[],
    ) {
        this._info('Saving primitives...')

        await SharedTables.manager.transaction(async (tx) => {
            await Promise.all([
                this._upsertBlock(block, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
            ])
        })
    }

    async _createAndPublishEvents() {
        // Contract events.
        const contractEventSpecs = await this._getDetectedContractEventSpecs()
        contractEventSpecs.length && await publishEventSpecs(contractEventSpecs)

        // New Ivy Smart Wallet events.
        const ivySmartWalletInitializerWalletCreatedEventSpecs = contractEventSpecs.filter(es => (
            es.name === ivySmartWalletInitializerWalletCreated
        ))
        if (ivySmartWalletInitializerWalletCreatedEventSpecs.length) {
            await sleep(100)
            await Promise.all(
                ivySmartWalletInitializerWalletCreatedEventSpecs.map(es => onIvyWalletCreatedContractEvent(es, this.web3))
            )
            await sleep(100)
        }

        // Token events.
        const tokenEventSpecs = await this._getNewTokenBalanceEventSpecs()
        const erc20EventSpecs = tokenEventSpecs?.erc20s || []
        const nftEventSpecs = tokenEventSpecs?.nfts || []
        await Promise.all([
            ...erc20EventSpecs.map(es => onNewERC20TokenBalanceEvent(es)),
            ...nftEventSpecs.map(es => onNewNFTBalanceEvent(es)),
        ])
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

        const chainName = productionChainNameForChainId(this.chainId)
        const specEventNamePrefix = chainName ? `${chainName}:` : ''

        const eventSpecs = []
        for (const decodedLog of decodedLogs) {
            const { eventName, address } = decodedLog
            if (!namespacedContractInfoByAddress.hasOwnProperty(address)) continue
            const { nsp, contractName } = namespacedContractInfoByAddress[address]
            const { data, eventOrigin } = this._formatLogEventArgsForSpecEvent(decodedLog)
            const namespacedEventName = [nsp, contractName, eventName].join('.')
            eventSpecs.push({
                name: `${specEventNamePrefix}${namespacedEventName}`,
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

    async _getNewTokenBalanceEventSpecs(): Promise<StringKeyMap> {
        const transfers = extractTransfersFromLogs(this.successfulLogs)
        if (!transfers.length) return {}

        const accounts = []
        for (const transfer of transfers) {
            transfer.from && accounts.push(transfer.from)
            transfer.to && accounts.push(transfer.to)
        }
        const referencedSmartWalletOwners = await this._getSmartWalletsForAddresses(
            Array.from(new Set(accounts))
        )
        if (!referencedSmartWalletOwners.length) return {}
        const smartWalletOwners = new Set(referencedSmartWalletOwners)
        
        const referencedContractAddresses = Array.from(new Set(transfers.map(t => t.log.address)))
        const contracts = await resolveContracts(referencedContractAddresses)

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
                    name: 'polygon:polygon.NewERC20TokenBalance@0.0.1',
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
                    name: 'polygon:polygon.NewNFTBalance@0.0.1',
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
        const placeholders = []
        let i = 1
        for (const _ of addresses) {
            placeholders.push(`$${i}`)
            i++
        }
        const results = (await SharedTables.query(
            `SELECT contract_address FROM ivy.smart_wallets WHERE contract_address IN (${placeholders.join(', ')})`,
            addresses,
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
            try {
                tx = this._decodeTransaction(tx, abis[tx.to], functionSignatures)
            } catch (err) {
                this._error(`Error decoding transaction ${tx.hash}: ${err}`)
            }
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
        
        const argNames = []
        const argTypes = []
        for (const input of abiItem.inputs || []) {
            input.name && argNames.push(input.name)
            argTypes.push(input.type)
        }

        const decodedArgs = web3js.eth.abi.decodeParameters(argTypes, `0x${argData}`)
        const numArgs = parseInt(decodedArgs.__length__)

        const argValues = []
        for (let i = 0; i < numArgs; i++) {
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
                value: formatAbiValueWithType(argValues[j], argTypes[j]),
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

    _decodeLogs(logs: PolygonLog[], abis: { [key: string]: Abi }): PolygonLog[] {
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

    _decodeLog(log: PolygonLog, abi: Abi): PolygonLog {
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

        return log
    }

    _formatLogEventArgsForSpecEvent(log: PolygonLog): StringKeyMap {
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
            this.blockHash || this.blockNumber,
            this.blockNumber,
            this.chainId
        )
    }

    async _getBlockReceiptsWithLogs(): Promise<ExternalPolygonReceipt[]> {
        return getBlockReceipts(
            this.web3,
            this.blockHash ? { blockHash: this.blockHash } : { blockNumber: this.hexBlockNumber },
            this.blockNumber,
            this.chainId
        )
    }

    async _waitAndRefetchReceipts(blockHash: string): Promise<ExternalPolygonReceipt[]> {
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

    _ensureAllShareSameBlockHash(
        block: PolygonBlock,
        receipts: ExternalPolygonReceipt[],
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
        this.transactions = (
            await tx
                .createQueryBuilder()
                .insert()
                .into(PolygonTransaction)
                .values(transactions.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
                .orUpdate(updateCols, conflictCols)
                .returning('*')
                .execute()
        ).generatedMaps
    }

    async _upsertLogs(logs: PolygonLog[], tx: any) {
        if (!logs.length) return
        const [updateCols, conflictCols] = fullPolygonLogUpsertConfig(logs[0])
        const blockTimestamp = this.pgBlockTimestamp
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
            .map((result) => result.generatedMaps)
            .flat()
    }

    async _deleteRecordsWithBlockNumber() {
        await SharedTables.manager.transaction(async (tx) => {
            const deleteBlock = tx
                .createQueryBuilder()
                .delete()
                .from(PolygonBlock)
                .where('number = :number', { number: this.blockNumber })
                .execute()
            const deleteTransactions = tx
                .createQueryBuilder()
                .delete()
                .from(PolygonTransaction)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            const deleteLogs = tx
                .createQueryBuilder()
                .delete()
                .from(PolygonLog)
                .where('blockNumber = :number', { number: this.blockNumber })
                .execute()
            await Promise.all([
                deleteBlock,
                deleteTransactions,
                deleteLogs,
            ])
        })
    }
}

export default PolygonIndexer