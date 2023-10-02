import { ev, config, StringKeyMap } from '../../shared'

const pollersConfig: StringKeyMap = {
    ...config,
    JOB_NAME: ev('JOB_NAME'),
    JOB_INTERVAL: Number(ev('JOB_INTERVAL', 60000)),
    CMC_API_KEY: ev('CMC_API_KEY'),
    CLEANUP_OPS_OLDER_THAN: Number(ev('CLEANUP_OPS_OLDER_THAN', 5)),
}

export default pollersConfig