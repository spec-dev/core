import AbstractIndexer from '../AbstractIndexer';
import { EthBlock, EthTrace, EthLog, NewReportedHead, PublicTables, numberToHex, EthTransaction } from 'shared'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import resolveBlock from './services/resolveBlock'
import getBlockReceipts from './services/getBlockReceipts'
import resolveBlockTraces from './services/resolveBlockTraces'
import initTransactions from './services/initTransactions'
import initLogs from './services/initLogs'
import config from '../../config'
import { ExternalEthTransaction, ExternalEthReceipt } from './types'

class EthereumIndexer extends AbstractIndexer {
    web3: AlchemyWeb3

    constructor(head: NewReportedHead) {
        super(head)
        this.web3 = createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
    }

    async perform() {
        super.perform()
        const { blockHash, blockNumber, chainId } = this.head
        const hexBlockNumber = numberToHex(blockNumber)

        // Resolve block (with txs data) by hash or number.
        const blockPromise = resolveBlock(this.web3, blockHash || hexBlockNumber, chainId)

        // Get all receipts with logs.
        const receiptsPromise = getBlockReceipts(this.web3, blockHash ? { blockHash } : { blockNumber: hexBlockNumber })

        // Resolve traces for block number.
        const tracesPromise = resolveBlockTraces(hexBlockNumber, chainId)

        // Wait for receipt and block promises to resolve (need them for EthTransaction and EthLog records).
        const [blockResult, receipts] = await Promise.all([blockPromise, receiptsPromise])
        const [externalBlock, block] = blockResult

        // Convert external block transactions into external transaction types.
        const externalTransactions = externalBlock.transactions.map(t => (t as unknown as ExternalEthTransaction))

        // Initialize our internal models for both transactions and logs.
        const transactions = initTransactions(block, externalTransactions, receipts)
        const logs = initLogs(block, receipts)

        // Wait for traces to resolve, then set blockTimestamp on each trace.
        let traces = await tracesPromise
        traces = traces.map(t => {
            t.blockTimestamp = block.timestamp
            return t
        })

        // Ensure all models share the same block hash (since it's possible some were fetched with block number).
        this._ensureAllShareSameBlockHash(block, receipts, traces)
        
        // Save all new models to public tables.
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

            await Promise.all([
                saveBlock,
                saveTransactions,
                saveLogs,
            ])
        })

        // Start broadcasting events for new primitives (NewBlock, NewTransaction, etc).

        // Parse logs for events.

        // Parse traces for contracts.
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
        if (receipts[0].blockHash !== hash) {
            throw `Receipts have hash mismatch -- Truth: ${hash}; Received: ${receipts[0].blockHash}`
        }
        // if (traces.length > 0 && traces[0].blockHash !== hash) {
        //     throw `Traces have hash mismatch -- Truth: ${hash}; Received: ${traces[0].blockHash}`
        // }
    }
}

export default EthereumIndexer