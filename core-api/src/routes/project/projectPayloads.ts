import { ValidatedPayload, StringKeyMap } from '../../types'

export interface GetProjectPayload {
    project: string // slug
    org: string // slug
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