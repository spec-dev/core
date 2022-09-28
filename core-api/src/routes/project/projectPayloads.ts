import { ValidatedPayload, StringKeyMap } from '../../types'

export interface GetProjectPayload {
    project: string // slug
    org: string // slug
}

export interface IdPayload {
    id: string
}

export function parseGetProjectPayload(data: StringKeyMap): ValidatedPayload<GetProjectPayload> {
    const project = data?.project
    if (!project) {
        return { isValid: false, error: '"project" key required' }
    }
    const org = data?.org
    if (!org) {
        return { isValid: false, error: '"org" key required' }
    }

    return { 
        isValid: true,
        payload: { project, org },
    }
}

export function parseIdPayload(data: StringKeyMap): ValidatedPayload<IdPayload> {
    const id = data?.id
    if (!id) {
        return { isValid: false, error: '"id" key required' }
    }
    return { 
        isValid: true,
        payload: { id },
    }
}