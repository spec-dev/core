import { NewReportedHead, StringKeyMap } from '../../shared'

export interface IndexerWorker {
    run: () => any
}

export interface Indexer {
    head: NewReportedHead
    resolvedBlockHash: string | null
    timedOut: boolean
    perform: (isJobWaitingWithBlockNumber?: Function) => Promise<StringKeyMap | void>
}

export interface EventOrigin {
    chainId: number
    blockNumber: number
    transactionHash?: string
}
