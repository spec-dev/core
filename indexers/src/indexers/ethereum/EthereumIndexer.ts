import AbstractIndexer from '../AbstractIndexer'
import { EthBlock, EthTrace, EthLog, NewReportedHead, PublicTables, numberToHex, EthTransaction, logger, EthTransactionStatus, EthTraceStatus } from 'shared'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import runEventGenerators from './services/runEventGenerators'
import config from '../../config'
import { ExternalEthTransaction, ExternalEthReceipt } from './types'

const timing = {
    NOT_READY_DELAY: 300,
    MAX_ATTEMPTS: 34
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
        const { blockHash, blockNumber, chainId } = this.head
        const hexBlockNumber = numberToHex(blockNumber)

        // Get blocks (w/txs), receipts (w/logs), and traces.
        const blockPromise = resolveBlock(this.web3, blockHash || blockNumber, blockNumber, chainId)
        const receiptsPromise = getBlockReceipts(this.web3, blockHash ? { blockHash } : { blockNumber: hexBlockNumber }, blockNumber, chainId)
        const tracesPromise = resolveBlockTraces(hexBlockNumber, blockNumber, chainId)

        // Wait for receipt and block promises to resolve (need them for transaction and log records).
        let [blockResult, receipts] = await Promise.all([blockPromise, receiptsPromise])
        const [externalBlock, block] = blockResult

        // Quick uncle check.
        let wasUncled = await this._wasUncled()
        if (wasUncled) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Ensure there's not a block hash mismatch between block and receipts.
        if (receipts.length > 0 && receipts[0].blockHash !== block.hash) {
            logger.warn(`Hash mismatch with receipts for block ${block.hash} -- refetching until equivalent.`)
            receipts = await this._waitAndRefetchReceipts(block.hash)
        }

        // Convert external block transactions into our custom external transaction type.
        const externalTransactions = externalBlock.transactions.map(t => (t as unknown as ExternalEthTransaction))

        // If transactions exist, but receipts don't, try one more time to get them before erroring.
        if (receipts.length === 0 && externalTransactions.length > 0) {
            logger.warn('Transactions exist but no receipts were found -- trying again.')
            receipts = await getBlockReceipts(this.web3, blockHash ? { blockHash } : { blockNumber: hexBlockNumber }, blockNumber, chainId)
            if (receipts.length === 0) {
                throw `Failed to fetch receipts when transactions (count=${externalTransactions.length}) clearly exist.`
            }
        } else if (externalTransactions.length === 0) {
            logger.info('No transactions this block.')
        }
        
        // Quick uncle check.
        wasUncled = await this._wasUncled()
        if (wasUncled) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }

        // Initialize our internal models for both transactions and logs.
        const transactions = externalTransactions.length > 0 ? initTransactions(block, externalTransactions, receipts) : []
        const logs = receipts.length > 0 ? initLogs(block, receipts) : []

        // Wait for traces to resolve and ensure there's not block hash mismatch.
        let traces = await tracesPromise
        if (traces.length > 0 && traces[0].blockHash !== block.hash) {
            logger.warn(`Hash mismatch with traces for block ${block.hash} -- refetching until equivalent.`)
            traces = await this._waitAndRefetchTraces(hexBlockNumber, block.hash)
        }
        traces = this._enrichTraces(traces, block)

        // Perform one final block hash mismatch check and error out if so.
        this._ensureAllShareSameBlockHash(block, receipts, traces)
        
        // Quick uncle check.
        wasUncled = await this._wasUncled()
        if (wasUncled) {
            logger.warn('Current block was uncled mid-indexing. Stopping.')
            return
        }
    
        // Find all unique contract addresses 'involved' in this block.
        this._findUniqueContractAddresses(transactions, logs, traces)

        // Find and run event generators associated with the unique contract instances seen.
        await runEventGenerators(this.uniqueContractAddresses, block)

        // Save all primitives to public tables.
        // this._savePrimitives(block, transactions, logs, traces),

        // Parse traces for new contracts.

        // Parse logs for events.

        // Handle public tables with higher-level data (NFTs, NFTCollections, NFTSale, etc.) and those events.
    }

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

    async _savePrimitives(block: EthBlock, transactions: EthTransaction[], logs: EthLog[], traces: EthTrace[]) {
       logger.info(`[${this.head.chainId}:${this.head.blockNumber}] Saving primitives...`)
 
        await PublicTables.manager.transaction(async tx => {
            const saveBlock = tx.save(block)
            const saveTransactions = tx
                .createQueryBuilder()
                .insert()
                .into(EthTransaction)
                .values(transactions)
                .execute()
            const saveLogs = tx
                .createQueryBuilder()
                .insert()
                .into(EthLog)
                .values(logs)
                .execute()
            const saveTraces = tx
                .createQueryBuilder()
                .insert()
                .into(EthTrace)
                .values(traces)
                .execute()
            await Promise.all([
                saveBlock,
                saveTransactions,
                saveLogs,
                saveTraces,
            ])
        })
    }

    _enrichTraces(traces: EthTrace[], block: EthBlock): EthTrace[] {
        return traces.map((t, i) => {
            t.traceIndex = i
            t.blockTimestamp = block.timestamp
            t.uncled = block.uncled
            return t
        })
    }

    async _waitAndRefetchReceipts(blockHash: string): Promise<ExternalEthReceipt[]> {
        const getReceipts = () => new Promise(async (res, _) => {
            const receipts = await getBlockReceipts(this.web3, { blockHash }, this.head.blockNumber, this.head.chainId)
            if (receipts.length && receipts[0].blockHash !== blockHash) {
                setTimeout(() => res(null), timing.NOT_READY_DELAY)
            } else {
                res(receipts)
            }
        })
    
        return new Promise(async (res, _) => {
            let receipts = null
            let numAttempts = 0
            while (receipts === null && numAttempts < timing.MAX_ATTEMPTS) {
                receipts = await getReceipts()
                numAttempts += 1
            }
            res(receipts || [])
        })
    }

    async _waitAndRefetchTraces(hexBlockNumber: string, blockHash: string): Promise<EthTrace[]> {
        const getTraces = () => new Promise(async (res, _) => {
            const traces = await resolveBlockTraces(hexBlockNumber, this.head.blockNumber, this.head.chainId)
            if (traces.length && traces[0].blockHash !== blockHash) {
                setTimeout(() => res(null), timing.NOT_READY_DELAY)
            } else {
                res(traces)
            }
        })
    
        return new Promise(async (res, _) => {
            let traces = null
            let numAttempts = 0
            while (traces === null && numAttempts < timing.MAX_ATTEMPTS) {
                traces = await getTraces()
                numAttempts += 1
            }
            res(traces || [])
        })
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

    // TODO: MAKES ME WANT TO SWITCH TO REGULAR PRIMARY KEY IDS INCREMENTING AND JUST ENFORCE UNIQUE CONTRAINTS ACROSS OTHER SHIT
    async _uncleExistingRecordsUsingBlockNumber() {
        await PublicTables.manager.transaction(async tx => {
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
            await Promise.all([
                deleteBlock,
                deleteTransactions,
                deleteLogs,
                deleteTraces,
            ])
        })
    }
}

export default EthereumIndexer