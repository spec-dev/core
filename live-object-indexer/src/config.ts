import { ev, config, StringKeyMap } from '../../shared'

const liveObjectIndexerConfig: StringKeyMap = {
    ...config,
    EVENT_GEN_AUTH_HEADER_NAME: 'Spec-Auth-Token',
    EVENT_GENERATORS_JWT: ev('EVENT_GENERATORS_JWT'),
    TABLES_AUTH_HEADER_NAME: 'Spec-Tables-Auth-Token',
    LIVE_OBJECT_VERSION_ID: Number(ev('LIVE_OBJECT_VERSION_ID')),
    BLOCK_RANGE_SIZE: Number(ev('BLOCK_RANGE_SIZE', 1000)),
}

export default liveObjectIndexerConfig