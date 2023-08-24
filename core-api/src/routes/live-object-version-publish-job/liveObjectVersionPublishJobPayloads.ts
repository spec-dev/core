import { ValidatedPayload, StringKeyMap } from '../../types'

interface GetLiveObjectVersionPublishJobPayload {
    uid: string
}

export function parseGetLiveObjectVersionPublishJobPayload(
    data: StringKeyMap
): ValidatedPayload<GetLiveObjectVersionPublishJobPayload> {
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
