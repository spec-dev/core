import AbstractIndexer from '../AbstractIndexer'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import getContracts from './services/getContracts'
import runEventGenerators from './services/runEventGenerators'
import config from '../../config'
import { ExternalEthTransaction, ExternalEthReceipt } from './types'
import { 
    sleep, 
    EthBlock, 
    EthTrace, 
    EthLog, 
    EthContract, 
    NewReportedHead, 
    SharedTables, 
    numberToHex, 
    EthTransaction, 
    logger, 
    EthTransactionStatus,
    EthTraceStatus,
    fullBlockUpsertConfig,
    fullContractUpsertConfig,
    fullLogUpsertConfig,
    fullTraceUpsertConfig,
    fullTransactionUpsertConfig,
} from 'shared'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
}

class EthereumIndexer extends AbstractIndexer {
    web3: AlchemyWeb3

    uniqueContractAddresses: Set<string>

    constructor(head: NewReportedHead) {
        super(head)
        this.web3 = createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
        this.uniqueContractAddresses = new Set()
    }

    async perform() {
        super.perform()

        // Get key identifiers of the block that needs indexing.
        const { blockHash, blockNumber, chainId } = this.head
        const hexBlockNumber = numberToHex(blockNumber)

        // Get blocks (w/txs), receipts (w/logs), and traces.
        const blockPromise = resolveBlock(this.web3, blockHash || blockNumber, blockNumber, chainId)
        const receiptsPromise = getBlockReceipts(this.web3, blockHash ? { blockHash } : { blockNumber: hexBlockNumber }, blockNumber, chainId)
        const tracesPromise = resolveBlockTraces(hexBlockNumber, blockNumber, chainId)

        // Wait for block and receipt promises to resolve (we need them for transactions and logs, respectively).
        let [blockResult, receipts] = await Promise.all([blockPromise, receiptsPromise])
        const [externalBlock, block] = blockResult

        // Quick uncle check.
        if (await this._wasUncled()) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Ensure there's not a block hash mismatch between block and receipts. 
        // This can happen when fetching by block number around chain re-orgs.
        if (receipts.length && receipts[0].blockHash !== block.hash) {
            logger.warn(`Hash mismatch with receipts for block ${block.hash} -- refetching until equivalent.`)
            receipts = await this._waitAndRefetchReceipts(block.hash)
        }

        // Convert external block transactions into our custom external eth transaction type.
        const externalTransactions = externalBlock.transactions.map(t => (t as unknown as ExternalEthTransaction))

        // If transactions exist, but receipts don't, try one more time to get them before erroring out.
        if (externalTransactions.length && !receipts.length) {
            logger.warn('Transactions exist but no receipts were found -- trying again.')
            receipts = await getBlockReceipts(this.web3, blockHash ? { blockHash } : { blockNumber: hexBlockNumber }, blockNumber, chainId)
            if (!receipts.length) {
                throw `Failed to fetch receipts when transactions (count=${externalTransactions.length}) clearly exist.`
            }
        } else if (!externalTransactions.length) {
            logger.info('No transactions this block.')
        }
        
        // Quick uncle check.
        if (await this._wasUncled()) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Initialize our internal models for both transactions and logs.
        const transactions = externalTransactions.length ? initTransactions(block, externalTransactions, receipts) : []
        const logs = receipts.length ? initLogs(block, receipts) : []

        // Wait for traces to resolve and ensure there's not block hash mismatch.
        let traces = await tracesPromise
        if (traces.length && traces[0].blockHash !== block.hash) {
            logger.warn(`Hash mismatch with traces for block ${block.hash} -- refetching until equivalent.`)
            traces = await this._waitAndRefetchTraces(hexBlockNumber, block.hash)
        }
        traces = this._enrichTraces(traces, block)

        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts, traces)

        // Get any new contracts deployed this block.
        const contracts = getContracts(traces)
        if (contracts.length) {
            logger.info(`[${this.head.chainId}:${this.head.blockNumber}] Got ${contracts.length} new contracts.`)
        }
    
        // TODO: Switch this to be more accurate once you have all contracts in your tables.
        // Find all unique contract addresses 'involved' in this block.
        this._findUniqueContractAddresses(transactions, logs, traces)

        // One more uncle check before taking action.
        if (await this._wasUncled()) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Save primitives to shared tables.
        await this._savePrimitives(block, transactions, logs, traces, contracts)

        // Find and run event generators associated with the unique contract instances seen.
        runEventGenerators(this.uniqueContractAddresses, block, chainId)
    }

    // TODO: Redo once you have contract addresses stored.
    _findUniqueContractAddresses(transactions: EthTransaction[], logs: EthLog[], traces: EthTrace[]) {
        transactions.forEach(tx => {
            if (tx.status === EthTransactionStatus.Success) {
                tx.to && this.uniqueContractAddresses.add(tx.to)
                tx.contractAddress && this.uniqueContractAddresses.add(tx.contractAddress)
            }
        })
        logs.forEach(log => {
            log.address && this.uniqueContractAddresses.add(log.address)
        })
        traces.forEach(trace => {
            if (trace.status === EthTraceStatus.Success) {
                trace.to && this.uniqueContractAddresses.add(trace.to)
            }
        })
    }

    async _savePrimitives(
        block: EthBlock,
        transactions: EthTransaction[],
        logs: EthLog[],
        traces: EthTrace[],
        contracts: EthContract[],
    ) {
       logger.info(`[${this.head.chainId}:${this.head.blockNumber}] Saving primitives...`)
 
        await SharedTables.manager.transaction(async tx => {
            await Promise.all([
                this._upsertBlock(block, tx),
                this._upsertTransactions(transactions, tx),
                this._upsertLogs(logs, tx),
                this._upsertTraces(traces, tx),
                this._upsertContracts(contracts, tx),
            ])
        })
    }
    
    async _upsertBlock(block: EthBlock, tx: any) {
        const [updateBlockCols, conflictBlockCols] = fullBlockUpsertConfig(block)
        await tx.createQueryBuilder()
            .insert()
            .into(EthBlock)
            .values(block)
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: EthTransaction[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = fullTransactionUpsertConfig(transactions[0])
        await tx.createQueryBuilder()
            .insert()
            .into(EthTransaction)
            .values(transactions)
            .orUpdate(updateTransactionCols, conflictTransactionCols)
            .execute()
    }

    async _upsertLogs(logs: EthLog[], tx: any) {
        if (!logs.length) return
        const [updateLogCols, conflictLogCols] = fullLogUpsertConfig(logs[0])
        await tx.createQueryBuilder()
            .insert()
            .into(EthLog)
            .values(logs)
            .orUpdate(updateLogCols, conflictLogCols)
            .execute()
    }

    async _upsertTraces(traces: EthTrace[], tx: any) {
        if (!traces.length) return
        const [updateTraceCols, conflictTraceCols] = fullTraceUpsertConfig(traces[0])
        await tx.createQueryBuilder()
            .insert()
            .into(EthTrace)
            .values(traces)
            .orUpdate(updateTraceCols, conflictTraceCols)
            .execute()
    }

    async _upsertContracts(contracts: EthContract[], tx: any) {
        if (!contracts.length) return
        const [updateContractCols, conflictContractCols] = fullContractUpsertConfig(contracts[0])
        await tx.createQueryBuilder()
            .insert()
            .into(EthContract)
            .values(contracts)
            .orUpdate(updateContractCols, conflictContractCols)
            .execute()
    }

    _enrichTraces(traces: EthTrace[], block: EthBlock): EthTrace[] {
        return traces.map((t, i) => {
            t.traceIndex = i
            t.blockTimestamp = block.timestamp
            return t
        })
    }

    async _waitAndRefetchReceipts(blockHash: string): Promise<ExternalEthReceipt[]> {
        const getReceipts = async () => {
            const receipts = await getBlockReceipts(this.web3, { blockHash }, this.head.blockNumber, this.head.chainId)
            if (receipts.length && receipts[0].blockHash !== blockHash) {
                return null
            } else {
                return receipts
            }
        }

        let receipts = null
        let numAttempts = 0
        while (receipts === null && numAttempts < timing.MAX_ATTEMPTS) {
            receipts = await getReceipts()
            if (receipts === null) {
                await sleep(timing.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
        return receipts || []
    }

    async _waitAndRefetchTraces(hexBlockNumber: string, blockHash: string): Promise<EthTrace[]> {
        const getTraces = async () => {
            const traces = await resolveBlockTraces(hexBlockNumber, this.head.blockNumber, this.head.chainId)
            if (traces.length && traces[0].blockHash !== blockHash) {
                return null
            } else {
                return traces
            }
        }

        let traces = null
        let numAttempts = 0
        while (traces === null && numAttempts < timing.MAX_ATTEMPTS) {
            traces = await getTraces()
            if (traces === null) {
                await sleep(timing.NOT_READY_DELAY)
            }
            numAttempts += 1
        }
        return traces || []
    }

    _ensureAllShareSameBlockHash(
        block: EthBlock,
        receipts: ExternalEthReceipt[],
        traces: EthTrace[],
    ) {
        const hash = this.head.blockHash || block.hash
        if (block.hash !== hash) {
            throw `Block has hash mismatch -- Truth: ${hash}; Received: ${block.hash}`
        }
        if (receipts.length > 0) {
            receipts.forEach(r => {
                if (r.blockHash !== hash) {
                    throw `Receipts have hash mismatch -- Truth: ${hash}; Received: ${r.blockHash}`
                }
            })
        }
        if (traces.length > 0) {
            traces.forEach(t => {
                if (t.blockHash !== hash) {
                    throw `Traces have hash mismatch -- Truth: ${hash}; Received: ${t.blockHash}`
                }
            })
        }
    }

    async _deleteRecordsWithBlockNumber() {
        await SharedTables.manager.transaction(async tx => {
            const deleteBlock = tx
                .createQueryBuilder()
                .delete()
                .from(EthBlock)
                .where('number = :number', { number: this.head.blockNumber })
                .execute()
            const deleteTransactions = tx
                .createQueryBuilder()
                .delete()
                .from(EthTransaction)
                .where('blockNumber = :number', { number: this.head.blockNumber })
                .execute()
            const deleteLogs = tx
                .createQueryBuilder()
                .delete()
                .from(EthLog)
                .where('blockNumber = :number', { number: this.head.blockNumber })
                .execute()
            const deleteTraces = tx
                .createQueryBuilder()
                .delete()
                .from(EthTrace)
                .where('blockNumber = :number', { number: this.head.blockNumber })
                .execute()
            const deleteContracts = tx
                .createQueryBuilder()
                .delete()
                .from(EthContract)
                .where('blockNumber = :number', { number: this.head.blockNumber })
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