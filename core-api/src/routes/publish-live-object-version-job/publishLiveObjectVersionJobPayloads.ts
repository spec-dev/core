import { ValidatedPayload, StringKeyMap } from '../../types'

interface GetPublishLiveObjectVersionJobPayload {
    uid: string
}

export function parseGetPublishLiveObjectVersionJobPayload(
    data: StringKeyMap
): ValidatedPayload<GetPublishLiveObjectVersionJobPayload> {
    const uid = data?.uid

    if (!uid) {
        return { isValid: false, error: '"uid" required' }
    }

    return {
        isValid: true,
        payload: {
            uid,
        },
    }
}
