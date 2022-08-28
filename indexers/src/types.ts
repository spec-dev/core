import { NewReportedHead } from 'shared'

export interface IndexerWorker {
    run: () => any
}

export interface Indexer {
    head: NewReportedHead
    resolvedBlockHash: string | null
    perform: () => Promise<void>
}

export interface EventOrigin {
    chainId: number
    blockNumber: number
    transactionHash?: string
}
