import { ValidatedPayload, StringKeyMap } from '../../types'

export interface GetProjectPayload {
    project: string // slug
    namespace: string // slug
}

export interface StreamLogsPayload {
    id: string
    env: string | null
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
    if (!id) {
        return { isValid: false, error: '"id" key required' }
    }
    return {
        isValid: true,
        payload: { id, env: data?.env || null },
    }
}
