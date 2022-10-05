export enum AbiDataType {
    Address = 'address',
    UInt256 = 'uint256',
    Bool = 'bool',
    String = 'string',
}

export interface AbiItemInput {
    type: AbiDataType
    name?: string
    indexed?: boolean
}

export interface AbiItemOutput {
    name: string
    type: AbiDataType
}

export enum AbiItemType {
    Function = 'function',
    Event = 'event',
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
}

export type Abi = AbiItem[]
