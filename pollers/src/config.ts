import { ev, config, StringKeyMap } from '../../shared'

const pollersConfig: StringKeyMap = {
    ...config,
    JOB_NAME: ev('JOB_NAME'),
    JOB_INTERVAL: Number(ev('JOB_INTERVAL', 59000)),
    CMC_API_KEY: ev('CMC_API_KEY'),
}

export default pollersConfig