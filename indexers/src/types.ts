import { NewReportedHead } from 'shared'

export interface Indexer {
    head: NewReportedHead
    perform(): Promise<void>
}

export interface EventOrigin {
    chainId: number
    blockNumber: number
    blockHash: string
    blockTimestamp: number   
    transactionHash?: string
}