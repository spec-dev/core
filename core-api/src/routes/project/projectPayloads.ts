import { ValidatedPayload, StringKeyMap } from '../../types'
import config from '../../config'

export interface GetProjectPayload {
    project: string // slug
    namespace: string // slug
}

export interface StreamLogsPayload {
    id: string
    tail?: number
    env?: string | null
}

export function parseGetProjectPayload(data: StringKeyMap): ValidatedPayload<GetProjectPayload> {
    const project = data?.project
    if (!project) {
        return { isValid: false, error: '"project" key required' }
    }
    const namespace = data?.namespace
    if (!namespace) {
        return { isValid: false, error: '"namespace" key required' }
    }

    return {
        isValid: true,
        payload: { project, namespace },
    }
}

export function parseStreamLogsPayload(data: StringKeyMap): ValidatedPayload<StreamLogsPayload> {
    const id = data?.id
    let tail = config.TRAILING_LOGS_BATCH_SIZE
    if (!id) {
        return { isValid: false, error: '"id" key required' }
    }
    if (data?.hasOwnProperty('tail')) {
        tail = parseInt(data.tail)
        if (isNaN(tail) || tail < 0) {
            return { isValid: false, error: `"tail" must be a non-zero integer` }
        }
    }
    tail = Math.min(tail, config.MAX_TRAILING_LOGS_BATCH_SIZE)
    return {
        isValid: true,
        payload: { id, tail: tail, env: data?.env || null },
    }
}
