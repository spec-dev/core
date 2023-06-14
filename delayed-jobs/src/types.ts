import { AbiItem, ContractInstance, Namespace } from '../../shared'

export interface EventViewSpec {
    schema: string
    name: string
    columnNames: string[]
    numEventArgs: number
    contractInstances: ContractInstance[]
    namespace: Namespace
    eventName: string
    eventSig: string
}

export interface EventSpec {
    eventName: string
    contractName: string
    contractInstances: ContractInstance[]
    namespace: Namespace
    abiItem: AbiItem
    namespacedVersion: string
}