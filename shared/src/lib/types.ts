import { LiveObjectVersionProperty, LiveObjectVersionConfig, ContractInstance, Namespace } from '..'
import { Abi, AbiItem } from './abi/types'

export interface NewReportedHead {
    id: number
    chainId: string
    blockNumber: number
    blockHash: string | null
    replace: boolean
    force: boolean
    fillingGap?: boolean
}

export interface SortedBlockEventsOptions {
    skipped?: boolean
    replay?: boolean
    replace?: boolean
}

export interface SpecFunctionResponse {
    data: any
    error: string | null
}

export type StringKeyMap = { [key: string]: any }

export type StringMap = { [key: string]: string }

export interface DelayedJobSpec {
    name: string
    params: StringKeyMap
}

export interface ContractRegistrationPayload {
    nsp: string
    groups: NewContractGroupPayload[]
}

export interface NewContractGroupPayload {
    name: string
    instances: NewContractInstancePayload[]
    isFactoryGroup: boolean
    abi?: Abi
}

export interface NewContractInstancePayload {
    address: string
    chainId: string
}

export interface PublishLiveObjectVersionPayload {
    namespace: string
    name: string
    displayName: string
    version: string
    description: string
    properties: LiveObjectVersionProperty[]
    config: LiveObjectVersionConfig
    inputEvents: string[]
    inputCalls: string[]
    additionalEventAssociations?: string[]
}

export interface ContractEventViewSpec {
    chainId: string
    name: string
    columnNames: string[]
    numEventArgs: number
    addresses: string[]
    contractName: string
    namespace: Namespace
    eventName: string
    eventSig: string
}

export interface ContractEventSpec {
    eventName: string
    contractName: string
    contractInstances: ContractInstance[]
    namespace: Namespace
    abiItem: AbiItem
    namespacedVersion: string
}
