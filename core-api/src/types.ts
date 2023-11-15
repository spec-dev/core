import { StringKeyMap } from '../../shared'
export { StringKeyMap }
export {
    StringMap,
    ContractRegistrationPayload,
    PublishLiveObjectVersionPayload,
} from '../../shared'

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
    codeUrl: string | null
    isContractEvent: boolean
    latestVersion: LatestLiveObjectVersion
}

export interface GenerateTestInputsPayload {
    inputs: StringKeyMap
    cursor: string | null
    chainIds: string[]
    from: string | null
    fromBlock: number | null
    to: string | null
    toBlock: number | null
    recent: boolean
    allTime: boolean
    streamId: string | null
    isContractFactory: boolean
}