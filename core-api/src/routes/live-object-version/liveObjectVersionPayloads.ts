import { ValidatedPayload, StringKeyMap, GenerateTestInputsPayload } from '../../types'
import { supportedChainIds, toNumber, toDate } from '../../../../shared'
import coreApiConfig from '../../config'

export interface PublishLiveObjectVersionPayload {
    nsp: string
    name: string
    version: string
    folder: string
}

export interface ParseLatestLovRecordsPayload {
    id: string
    cursor: string | null
}

export interface GetLiveObjectVersionPayload {
    id: string
}

export interface LovRecordCountsPayload {
    ids: string[]
}

export function parsePublishLiveObjectVersionPayload(
    data: StringKeyMap
): ValidatedPayload<PublishLiveObjectVersionPayload> {
    const nsp = data?.nsp
    const name = data?.name
    const version = data?.version
    let folder = data?.folder

    if (!nsp) {
        return { isValid: false, error: 'No "nsp" given' }
    }
    if (!name) {
        return { isValid: false, error: 'No "name" given' }
    }
    if (!version) {
        return { isValid: false, error: 'No "version" given' }
    }
    if (!folder) {
        return { isValid: false, error: 'No "folder" given' }
    }

    while (folder.startsWith('.') || folder.startsWith('/')) {
        folder = folder.slice(1)
    }
    if (!folder) {
        return { isValid: false, error: 'Invalid "folder" given' }
    }

    return {
        isValid: true,
        payload: {
            nsp,
            name,
            version,
            folder,
        }
    }
}

export function parseGenerateTestInputsPayload(
    data: StringKeyMap
): ValidatedPayload<GenerateTestInputsPayload> {
    const inputs = data?.inputs || {}
    const cursor = data?.cursor
    const chainIds = (data?.chainIds || []).map(id => id.toString())
    let from = data?.from
    let fromBlock = data?.fromBlock
    let to = data?.to
    let toBlock = data?.toBlock
    const recent = !!data?.recent
    const allTime = !!data?.allTime
    const streamId = data?.streamId
    const isContractFactory = data?.isContractFactory || false

    if (!inputs || (!inputs.events?.length && !inputs.calls?.length)) {
        return { isValid: false, error: 'No inputs given' }
    }

    // Validate chain ids.
    const invalidChainIds = chainIds.filter((id) => !supportedChainIds.has(id))
    if (invalidChainIds.length) {
        return { isValid: false, error: `Invalid chain ids: ${invalidChainIds.join(', ')}` }
    }

    fromBlock = fromBlock ? toNumber(fromBlock) : null
    toBlock = toBlock ? toNumber(toBlock) : null
    from = from ? toDate(from) : null
    to = to ? toDate(to) : null

    if (fromBlock !== null && fromBlock < 0) {
        return { isValid: false, error: `"fromBlock" can't be negative` }
    }
    if (toBlock !== null && toBlock < 0) {
        return { isValid: false, error: `"toBlock" can't be negative` }
    }

    // Prevent days and block ranges from meshing.
    if ((fromBlock || toBlock) && recent) {
        return {
            isValid: false,
            error: `"recent" can't be used together with "fromBlock" or "toBlock"`,
        }
    }
    if (from && to && recent) {
        return { isValid: false, error: `"recent" can't be used together with "from" or "to"` }
    }
    if ((fromBlock || toBlock) && (from || to)) {
        return { isValid: false, error: `Can't blend blocks and dates when specifying a range.` }
    }
    if ((fromBlock || toBlock) && (from || to) && allTime) {
        return { isValid: false, error: `Can't specify a range when using "allTime"` }
    }

    // Only 1 chain can be specified when using block ranges.
    if ((fromBlock || toBlock) && chainIds.length > 1) {
        return {
            isValid: false,
            error: `Can only use "fromBlock" and "toBlock" with a single chain.`,
        }
    }

    // Ensure ranges only move forwards in time or in series.
    if (fromBlock && toBlock && fromBlock > toBlock) {
        return { isValid: false, error: `Invalid block range: ${fromBlock} -> ${toBlock}` }
    }
    if (from && to && from > to) {
        return { isValid: false, error: `Invalid date range: ${from} -> ${to}` }
    }

    // Block ranges take priority over date ranges.
    if (fromBlock && from) {
        from = null
    }
    if (toBlock && to) {
        to = null
    }

    return {
        isValid: true,
        payload: {
            inputs,
            cursor,
            chainIds,
            from,
            fromBlock,
            to,
            toBlock,
            recent,
            allTime,
            streamId,
            isContractFactory,
        } as GenerateTestInputsPayload,
    }
}

export function parseLatestLovRecordsPayload(
    data: StringKeyMap
): ValidatedPayload<ParseLatestLovRecordsPayload> {
    const id = data?.id
    const cursor = data?.cursor || null

    if (!id) {
        return { isValid: false, error: '"id" is required' }
    }

    return {
        isValid: true,
        payload: { id, cursor },
    }
}

export function parseGetLiveObjectVersionPayload(
    data: StringKeyMap
): ValidatedPayload<GetLiveObjectVersionPayload> {
    const id = data?.id

    if (!id) {
        return { isValid: false, error: '"id" is required' }
    }

    return {
        isValid: true,
        payload: { id },
    }
}

export function parseLovRecordCountsPayload(data: StringKeyMap): ValidatedPayload<LovRecordCountsPayload> {
    const ids = data?.ids || []

    if (!ids.length) {
        return { isValid: false, error: '"ids" was missing or empty' }
    }

    if (ids.length > coreApiConfig.MAX_RECORD_COUNT_BATCH_SIZE) {
        return { 
            isValid: false, 
            error: `Request exceeds maximum limit of ${coreApiConfig.MAX_RECORD_COUNT_BATCH_SIZE} entries` 
        }
    }

    return {
        isValid: true,
        payload: { ids },
    }
}