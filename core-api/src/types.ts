import { StringKeyMap } from '../../shared'
export { StringKeyMap }

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
    desc: string
    latestVersion: LatestLiveObjectVersion
}