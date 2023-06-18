import { LiveObjectVersionProperty, LiveObjectVersionConfig, ContractInstance, Namespace } from '..'
import { Abi, AbiItem } from './abi/types'

export interface NewReportedHead {
    id: number
    chainId: string
    blockNumber: number
    blockHash: string | null
    replace: boolean
    force: boolean
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
    chainId: string
    nsp: string
    name: string
    desc: string
    instances: NewContractInstancePayload[]
    abi?: Abi
}

export interface NewContractInstancePayload {
    address: string
    name: string
    desc?: string
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
    schema: string
    name: string
    columnNames: string[]
    numEventArgs: number
    contractInstances: ContractInstance[]
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
