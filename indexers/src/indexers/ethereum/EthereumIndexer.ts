import AbstractIndexer from '../AbstractIndexer';
import { NewReportedHead } from 'shared'
import { createAlchemyWeb3, AlchemyWeb3 } from '@alch/alchemy-web3'
import getAndStoreBlock from './services/getAndStoreBlock'
import getBlockReceipts from './services/getBlockReceipts'
import getBlockTraces from './services/getBlockTraces'
import storeTransactions from './services/storeTransactions'
import storeLogs from './services/storeLogs'
import storeTraces from './services/storeTraces'
import config from '../../config'

class EthereumIndexer extends AbstractIndexer {
    web3: AlchemyWeb3

    constructor(head: NewReportedHead) {
        super(head)
        this.web3 = createAlchemyWeb3(config.ALCHEMY_ETH_MAINNET_REST_URL)
    }

    async perform() {
        // TODO: DON'T FORGET ABOUT UPDATING THE IndexedBlock.status field as this job progresses
        // ALSO GO PREFIX PRETTY MUCH EVERYTHINGTH ETH

        // Fetch block (+ transactions) and upsert the block to public tables (flushing).
        const indexBlockPromise = getAndStoreBlock(this.web3, this.head.blockNumber)

        // Fetch all receipts with logs.
        const receiptsPromise = getBlockReceipts(this.web3, this.head.blockNumber)

        // Fetch traces for block.
        const tracesPromise = getBlockTraces(this.head.blockNumber)

        // Wait in parallel for internal block record to be flushed and receipts to resolve.
        const [indexBlockResult, receipts] = await Promise.all([
            indexBlockPromise,
            receiptsPromise,
        ])
        const [externalBlock, internalBlock] = indexBlockResult

        // Store transactions with receipts (flushing).
        const transactions = await storeTransactions(
            internalBlock, 
            externalBlock.transactions,
            receipts,
        )

        // Store logs and traces in parallel.
        const [logs, traces] = await Promise.all([
            storeLogs(transactions, receipts),
            storeTraces(tracesPromise, transactions)
        ])

        // Commit to public tables.

        // Start broadcasting events for new primitives (NewBlock, NewTransaction, etc).

        // Parse logs for events.

        // Parse traces for contracts.
    }
}

export default EthereumIndexer