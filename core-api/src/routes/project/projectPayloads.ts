import { ValidatedPayload, StringKeyMap } from '../../types'

export interface IdPayload {
    id: string
}

export function parseIdPayload(data: StringKeyMap): ValidatedPayload<IdPayload> {
    const id = data?.id
    if (!id) {
        return { isValid: false, error: 'Project "id" required' }
    }

    return { 
        isValid: true,
        payload: { id },
    }
}