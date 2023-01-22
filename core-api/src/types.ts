import { StringKeyMap } from '../../shared'
export { StringKeyMap }
export { StringMap, NewContractPayload, PublishLiveObjectVersionPayload } from '../../shared'

export interface ValidatedPayload<T> {
    isValid: boolean
    payload?: T
    error?: string 
}

export interface LatestLiveObjectVersion {
    nsp: string
    name: string
    version: string
    properties: StringKeyMap[]
    example: StringKeyMap
    config: StringKeyMap | null
    createdAt: string
}

export interface LatestLiveObject {
    id: string
    name: string
    displayName: string
    desc: string
    icon: string
    latestVersion: LatestLiveObjectVersion
}