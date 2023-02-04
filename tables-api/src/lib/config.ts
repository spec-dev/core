import { ev, config, StringKeyMap } from '../../../shared'

const tablesApiConfig: StringKeyMap = {
    ...config,
    PORT: Number(ev('PORT', 4000)),
    STREAM_BATCH_SIZE: Number(ev('STREAM_BATCH_SIZE', 1000)),
    AUTH_HEADER_NAME: 'Spec-Auth-Token',
}

export default tablesApiConfig