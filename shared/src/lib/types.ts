import { LiveObjectVersionProperty, LiveObjectVersionConfig } from '..'

export interface NewReportedHead {
    id: number
    chainId: string
    blockNumber: number
    blockHash: string | null
    replace: boolean
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

export interface NewContractsPayload {
    nsp: string
    chainId: string
    contracts: NewContractPayload[]
    refetchAbis?: boolean
}

export interface NewContractPayload {
    name: string
    desc: string
    instances: NewContractInstancePayload[]
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
    events: StringMap
    additionalEventAssociations?: string[]
}
