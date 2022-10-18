export interface NewReportedHead {
    id: number
    chainId: number
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
