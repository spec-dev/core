import { ev, config, StringKeyMap } from '../../shared'

const pollersConfig: StringKeyMap = {
    ...config,
    JOB_NAME: ev('JOB_NAME'),
    JOB_INTERVAL: Number(ev('JOB_INTERVAL', 60000)),
    CMC_API_KEY: ev('CMC_API_KEY'),
    CLEANUP_OPS_OLDER_THAN: Number(ev('CLEANUP_OPS_OLDER_THAN', 5)),
    RECORD_COUNT_CHANGED_PG_CHANNEL: 'record_count_changed',
    ALGOLIA_APPLICATION_ID: ev('ALGOLIA_APPLICATION_ID'),
    ALGOLIA_ADMIN_API_KEY: ev('ALGOLIA_ADMIN_API_KEY'),
    ALGOLIA_SYNC_ALL: ev('ALGOLIA_SYNC_ALL'),
    DENO_URL_BATCH_SIZE: Number(ev('DENO_URL_BATCH_SIZE', 30)),
}

export default pollersConfig