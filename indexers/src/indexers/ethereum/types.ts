export interface ExternalEthTransaction {
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

export interface ExternalEthBlock {
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
    transactions: ExternalEthTransaction[]
}

export interface ExternalEthLog {
    logIndex: string
    address?: string | null
    topics?: string[] | null
    data?: string | null
    blockNumber: string 
    blockHash: string
    transactionHash: string
    transactionIndex: string
}

export interface ExternalEthReceipt {
    transactionHash: string
    transactionIndex: string
    from: string
    logs: ExternalEthLog[]
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

/**
action: {
    from: '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41',
    callType: 'staticcall',
    gas: '0x1359b',
    input: '0x02571be30ac830beb28b11866bba60dcbb9aee89e5404a93e47f73e70b8a8507a227f98a',
    to: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
    value: '0x0'
},
blockHash: '0x788c93dcfacc07d03aae80064b623b6dc85d58835f69ddf90619e9832598d702',
blockNumber: 15119083,
result: {
    gasUsed: '0x3b7',
    output: '0x000000000000000000000000283af0b28c62c092c9727f1ee09c02ca627eb7f5'
},
subtraces: 0,
traceAddress: [ 7, 1 ],
transactionHash: '0x3c0eb215ddc34a8e8c21309c84055ee1f2cbdf7984cc5aac977541e03dfe3d20',
transactionPosition: 44,
type: 'call'
 */
export interface ExternalEthTrace {
    action: { [key: string]: any }
    blockHash: string
    blockNumber: number
    result: { [key: string]: any }
    subtraces: number
    traceAddress: number[]
    transactionHash: string
    transactionPosition: number
    type: string
}