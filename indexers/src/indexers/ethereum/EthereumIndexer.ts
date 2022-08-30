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
    EthTraceStatus,
    fullBlockUpsertConfig,
    fullContractUpsertConfig,
    fullLogUpsertConfig,
    fullTraceUpsertConfig,
    fullTransactionUpsertConfig,
    mapByKey,
} from '../../../../shared'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 100,
}

class EthereumIndexer extends AbstractIndexer {
    web3: AlchemyWeb3

    uniqueContractAddresses: Set<string>

    constructor(head: NewReportedHead, web3?: AlchemyWeb3) {
        super(head)
        this.web3 = web3 || createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
        this.uniqueContractAddresses = new Set()
    }

    async perform() {
        super.perform()

        // Get blocks (+transactions), receipts (+logs), and traces.
        const blockPromise = this._getBlockWithTransactions()
        const tracesPromise = this._getTraces()
        
        // HACK
        let blockResult
        let receipts = null
        if (config.IS_RANGE_MODE) {
            blockResult = await blockPromise
        } else {
            ;([blockResult, receipts] = await Promise.all([blockPromise, this._getBlockReceiptsWithLogs()]))
        }
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
        if (!config.IS_RANGE_MODE && receipts.length && receipts[0].blockHash !== block.hash) {
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

        const logs = receipts?.length ? initLogs(block, receipts) : []

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

        // TODO: Switch this to be more accurate once you have all contracts in your tables.
        // Find all unique contract addresses 'involved' in this block.
        // config.IS_RANGE_MODE || this._findUniqueContractAddresses(transactions, logs, traces)

        // One more uncle check before taking action.
        if (await this._wasUncled()) {
            this._warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Save primitives to shared tables.
        await this._savePrimitives(block, transactions, logs, traces, contracts)

        // Find and run event generators associated with the unique contract instances seen.
        // config.IS_RANGE_MODE || runEventGenerators(this.uniqueContractAddresses, block, this.chainId)
    }

    // TODO: Redo once you have contract addresses stored.
    _findUniqueContractAddresses(
        transactions: EthTransaction[],
        logs: EthLog[],
        traces: EthTrace[]
    ) {
        transactions.forEach((tx) => {
            if (tx.status === EthTransactionStatus.Success) {
                tx.to && this.uniqueContractAddresses.add(tx.to)
                tx.contractAddress && this.uniqueContractAddresses.add(tx.contractAddress)
            }
        })
        logs.forEach((log) => {
            log.address && this.uniqueContractAddresses.add(log.address)
        })
        traces.forEach((trace) => {
            if (trace.status === EthTraceStatus.Success) {
                trace.to && this.uniqueContractAddresses.add(trace.to)
            }
        })
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
        return resolveBlockTraces(this.hexBlockNumber, this.blockNumber, this.chainId)
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
        while (receipts === null && numAttempts < timing.MAX_ATTEMPTS) {
            receipts = await getReceipts()
            if (receipts === null) {
                await sleep(timing.NOT_READY_DELAY)
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

    async _savePrimitives(
        block: EthBlock,
        transactions: EthTransaction[],
        logs: EthLog[],
        traces: EthTrace[],
        contracts: EthContract[]
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
    }

    async _upsertBlock(block: EthBlock, tx: any) {
        const [updateBlockCols, conflictBlockCols] = fullBlockUpsertConfig(block)

        await tx
            .createQueryBuilder()
            .insert()
            .into(EthBlock)
            .values({
                ...block,
                timestamp: () => this.pgBlockTimestamp,
            })
            .orUpdate(updateBlockCols, conflictBlockCols)
            .execute()
    }

    async _upsertTransactions(transactions: EthTransaction[], tx: any) {
        if (!transactions.length) return
        const [updateTransactionCols, conflictTransactionCols] = fullTransactionUpsertConfig(
            transactions[0]
        )
        const blockTimestamp = this.pgBlockTimestamp
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthTransaction)
            .values(transactions.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
            .orUpdate(updateTransactionCols, conflictTransactionCols)
            .execute()
    }

    async _upsertLogs(logs: EthLog[], tx: any) {
        if (!logs.length) return
        const [updateLogCols, conflictLogCols] = fullLogUpsertConfig(logs[0])
        const blockTimestamp = this.pgBlockTimestamp
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthLog)
            .values(logs.map((l) => ({ ...l, blockTimestamp: () => blockTimestamp })))
            .orUpdate(updateLogCols, conflictLogCols)
            .execute()
    }

    async _upsertTraces(traces: EthTrace[], tx: any) {
        if (!traces.length) return
        const [updateTraceCols, conflictTraceCols] = fullTraceUpsertConfig(traces[0])
        const blockTimestamp = this.pgBlockTimestamp
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthTrace)
            .values(traces.map((t) => ({ ...t, blockTimestamp: () => blockTimestamp })))
            .orUpdate(updateTraceCols, conflictTraceCols)
            .execute()
    }

    async _upsertContracts(contracts: EthContract[], tx: any) {
        if (!contracts.length) return
        const [updateContractCols, conflictContractCols] = fullContractUpsertConfig(contracts[0])
        const blockTimestamp = this.pgBlockTimestamp
        await tx
            .createQueryBuilder()
            .insert()
            .into(EthContract)
            .values(contracts.map((c) => ({ ...c, blockTimestamp: () => blockTimestamp })))
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
