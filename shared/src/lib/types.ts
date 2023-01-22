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

export interface NewContractPayload {
    nsp: string
    name: string
    desc: string
    instances: NewContractInstancePayload[]
}

export interface NewContractInstancePayload {
    chainId: string
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
