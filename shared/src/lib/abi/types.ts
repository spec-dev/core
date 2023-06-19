export interface AbiItemInput {
    type: string
    name?: string
    indexed?: boolean,
    internalType?: string
}

export interface AbiItemOutput {
    name: string
    type: string
}

export enum AbiItemType {
    Function = 'function',
    Event = 'event',
    Constructor = 'constructor',
}

export enum AbiItemStateMutability {
    Payable = 'payable',
    NonPayable = 'nonpayable',
    View = 'view',
}

export interface AbiItem {
    name: string
    type: AbiItemType
    inputs: AbiItemInput[]
    signature: string
    constant?: boolean
    outputs?: AbiItemOutput[]
    payable?: boolean
    stateMutability?: AbiItemStateMutability
    anonymous?: boolean,
}

export type Abi = AbiItem[]
