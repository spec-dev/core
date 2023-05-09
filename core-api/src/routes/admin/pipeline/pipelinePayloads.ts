import { ValidatedPayload, StringKeyMap } from '../../../types'
import { supportedChainIds, indexerRedisKeys, attemptToParseNumber } from '../../../../../shared'

const processJobKeys = new Set([
    indexerRedisKeys.PROCESS_NEW_HEADS_PREFIX,
    indexerRedisKeys.PROCESS_INDEX_JOBS_PREFIX,
    indexerRedisKeys.PROCESS_EVENT_SORTER_JOBS_PREFIX,
    indexerRedisKeys.PROCESS_EVENT_GEN_JOBS_PREFIX,
])

interface ToggleProcessJobsPayload {
    chainId: string
    key: string
    value: boolean
}

interface GetProcessJobsStatusPayload {
    chainId: string
    key: string
}

interface ChainIdPayload {
    chainId: string
}

interface ChainIdBlockNumberPayload {
    chainId: string
    blockNumber: number
}

interface LovIdPayload {
    lovId: number
}

export function parseToggleProcessJobsPayload(
    data: StringKeyMap,
): ValidatedPayload<ToggleProcessJobsPayload> {
    const chainId = data?.chainId
    const key = data?.key
    const value = data?.value

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (!processJobKeys.has(key)) {
        return { isValid: false, error: `Invalid "key": ${key}` }
    }

    if (![true, false].includes(value)) {
        return { isValid: false, error: '"value" must be a boolean' }
    }

    return {
        isValid: true,
        payload: {
            chainId,
            key,
            value,
        },
    }
}

export function parseGetProcessJobsStatusPayload(
    data: StringKeyMap,
): ValidatedPayload<GetProcessJobsStatusPayload> {
    const chainId = data?.chainId
    const key = data?.key

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (!processJobKeys.has(key)) {
        return { isValid: false, error: `Invalid "key": ${key}` }
    }

    return {
        isValid: true,
        payload: {
            chainId,
            key,
        },
    }
}

export function parseChainIdPayload(
    data: StringKeyMap,
): ValidatedPayload<ChainIdPayload> {
    const chainId = data?.chainId

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    return {
        isValid: true,
        payload: {
            chainId,
        },
    }
}

export function parseChainIdBlockNumberPayload(
    data: StringKeyMap,
    requireBlockNumber: boolean = false,
): ValidatedPayload<ChainIdBlockNumberPayload> {
    const chainId = data?.chainId
    let blockNumber = data?.blockNumber

    if (!supportedChainIds.has(chainId)) {
        return { isValid: false, error: `Invalid "chainId": ${chainId}` }
    }

    if (requireBlockNumber) {
        blockNumber = parseInt(blockNumber)
        if (Number.isNaN(blockNumber)) {
            return { isValid: false, error: `Invalid "blockNumber": ${data?.blockNumber}` }
        }    
    }

    return {
        isValid: true,
        payload: {
            chainId,
            blockNumber
        },
    }
}

export function parseLovIdPayload(
    data: StringKeyMap,
): ValidatedPayload<LovIdPayload> {
    const lovId = data?.lovId

    if (!lovId) {
        return { isValid: false, error: `"lovId" required` }
    }

    return {
        isValid: true,
        payload: {
            lovId,
        },
    }
}