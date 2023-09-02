import { ValidatedPayload, StringKeyMap } from '../../types'

export interface GetAbiPayload {
    group: string
}

export function parseGetAbiPayload(data: StringKeyMap): ValidatedPayload<GetAbiPayload> {
    const group = data?.group

    if (!group) {
        return { isValid: false, error: '"group" required' }
    }

    return {
        isValid: true,
        payload: { group },
    }
}
