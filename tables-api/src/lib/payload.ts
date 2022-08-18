import { QueryPayload, StringKeyMap } from './types'

export function getQueryPayload(body: StringKeyMap): [QueryPayload, boolean] {
    const payload = body as QueryPayload
    return [payload, !!payload.sql]
}