import { publishLiveObjectVersion, StringKeyMap } from '../../../shared'

export default function job(params: StringKeyMap) {
    const namespace = params.namespace || {}
    const liveObjectId = params.liveObjectId
    const payload = params.payload || {}
    return {
        perform: async () => publishLiveObjectVersion(namespace, liveObjectId, payload)
    }
}
