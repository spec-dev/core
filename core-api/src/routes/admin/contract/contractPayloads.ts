import { ValidatedPayload, StringKeyMap } from '../../../types'

interface ResetContractGroupRecordCountsPayload {
    group: string
}

export function parseResetContractGroupRecordCountsPayload(
    data: StringKeyMap
): ValidatedPayload<ResetContractGroupRecordCountsPayload> {
    const group = data?.group

    if (!group) {
        return { isValid: false, error: '"group" required' }
    }

    if (group.split('.').length !== 4) {
        return { isValid: false, error: 'Invalid "group" - must be a full contract group' }
    }

    return {
        isValid: true,
        payload: { group },
    }
}
