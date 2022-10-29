import AbstractIndexer from '../AbstractIndexer'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import getContracts from './services/getContracts'
import initLatestInteractions from './services/initLatestInteractions'
import { publishDiffsAsEvents } from '../../events/relay'
import { NewInteractions, NewTransactions } from '../../events'
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
    fullLatestInteractionUpsertConfig,
    StringKeyMap,
    EthLatestInteraction,
    toChunks,
    enqueueDelayedJob,
} from '../../../../shared'

class EthereumIndexer extends AbstractIndexer {
    
    web3: AlchemyWeb3

    uniqueContractAddresses: Set<string>

    block: EthBlock = null

    transactions: EthTransaction[] = []

    logs: EthLog[] = []

    traces: EthTrace[] = []

    contracts: EthContract[] = []

    latestInteractions: EthLatestInteraction[] = []

    constructor(head: NewReportedHead, web3?: AlchemyWeb3) {
        super(head)
        this.web3 = web3 || createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
        this.uniqueContractAddresses = new Set()
    }

    async perform(): Promise<StringKeyMap | void> {
        super.perform()

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

        // Format transactions as the latest interactions between addresses.
        const latestInteractions = await initLatestInteractions(transactions, contracts)

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

        // Create and publish Spec events to the event relay.
        try {
            await this._createAndPublishEvents()
        } catch (err) {
            this._error('Publishing events failed:', err)
        }

        // Kick off delayed job to fetch abis for new contracts.
        contracts.length && (await this._fetchAbisForNewContracts(contracts))
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
        const eventOrigin = {
            chainId: this.chainId,
            blockNumber: this.blockNumber,
        }
        const eventSpecs = [
            {
                namespacedVersion: 'eth.NewTransactions@0.0.1',
                diff: NewTransactions(this.transactions),
            },
            {
                namespacedVersion: 'eth.NewInteractions@0.0.1',
                diff: NewInteractions(this.latestInteractions),
            },
        ]
        await publishDiffsAsEvents(eventSpecs, eventOrigin)
    }

    async _fetchAbisForNewContracts(contracts: EthContract[]) {
        const addresses = contracts.map((c) => c.address)

        // TODO: Check abi redis to see if these abis already exist and only add the new ones.

        await enqueueDelayedJob('upsertAbis', { addresses })
    }

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
