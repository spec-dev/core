export interface ExternalEvmTransaction {
    hash: string
    from: string
    nonce: number
    transactionIndex: number
    gas?: number | null
    gasPrice?: string | null
    maxFeePerGas?: string | null
    maxPriorityFeePerGas?: string | null
    input?: string | null
    to?: string | null
    value?: string | null
    type?: number | null
    blockHash: string
    blockNumber: number
}

export interface ExternalEvmBlock {
    baseFeePerGas?: number
    difficulty: string
    extraData: string
    gasLimit: number
    gasUsed: number
    hash: string
    logsBloom: string
    miner: string
    mixHash: string
    nonce: string
    number: number
    parentHash: string
    receiptsRoot: string
    sha3Uncles: string
    size: number
    stateRoot: string
    timestamp: number
    totalDifficulty: string
    transactionsRoot: string
    transactions: ExternalEvmTransaction[]
}

export interface ExternalEvmLog {
    logIndex: string
    address?: string | null
    topics?: string[] | null
    data?: string | null
    blockNumber: string
    blockHash: string
    transactionHash: string
    transactionIndex: string
    removed?: boolean
}

export interface ExternalEvmReceipt {
    transactionHash: string
    transactionIndex: string
    from: string
    logs: ExternalEvmLog[]
    logsBloom: string
    contractAddress?: string | null
    gasUsed?: string | null
    cumulativeGasUsed?: string | null
    effectiveGasPrice?: string | null
    root?: string | null
    status?: string | null
    to?: string | null
    type?: string | null
    blockHash: string
    blockNumber: string
}

export interface ExternalEvmParityTrace {
    action?: { [key: string]: any } | null
    blockHash: string
    blockNumber: number
    result?: { [key: string]: any } | null
    subtraces: number
    traceAddress?: number[] | null
    transactionHash?: string | null
    transactionPosition?: number | null
    type: string
    error?: string | null
}

export interface ExternalEvmDebugTrace {
    type: string
    from: string
    to: string
    value?: string
    gas: string
    gasUsed: string
    input: string
    output: string
    error?: string
    calls?: ExternalEvmDebugTrace[]
}

export interface EvmWeb3Options {
    canGetBlockReceipts?: boolean
    canGetParityTraces?: boolean
    isRangeMode?: boolean
}
