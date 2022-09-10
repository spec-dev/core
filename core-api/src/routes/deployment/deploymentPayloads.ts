import { ValidatedPayload, StringKeyMap } from '../../types'

export interface NewDeploymentPayload {
    projectId: string
}

export function parseNewDeploymentPayload(data: StringKeyMap): ValidatedPayload<NewDeploymentPayload> {
    const projectId = data?.projectId
    if (!projectId) {
        return { isValid: false, error: '"projectId" required' }
    }

    return { 
        isValid: true,
        payload: { projectId },
    }
}