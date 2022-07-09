
export interface ExternalTrace {
    action: { [key: string]: any }
    blockHash: string
    blockNumber: number
    result: { [key: string]: any }
    subtraces: number
    traceAddress: string[]
    transactionHash: string
    transactionPosition: string
    type: string
}