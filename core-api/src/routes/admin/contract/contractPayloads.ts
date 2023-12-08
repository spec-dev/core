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

    if (group.split('.').length !== 2) {
        return { isValid: false, error: `Invalid group: ${group}` }
    }

    return {
        isValid: true,
        payload: { group },
    }
}
