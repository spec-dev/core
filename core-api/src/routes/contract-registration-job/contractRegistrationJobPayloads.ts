import { ValidatedPayload, StringKeyMap } from '../../types'

interface GetContractRegistrationJobPayload {
    uid: string
}

export function parseGetContractRegistrationJobPayload(
    data: StringKeyMap
): ValidatedPayload<GetContractRegistrationJobPayload> {
    const uid = data?.uid

    if (!uid) {
        return { isValid: false, error: '"uid" required' }
    }

    return {
        isValid: true,
        payload: {
            uid,
        }
    }
}
