import { ev, config, StringKeyMap } from '../../shared'

const pollersConfig: StringKeyMap = {
    ...config,
    JOB_NAME: ev('JOB_NAME'),
    CMC_API_KEY: ev('CMC_API_KEY'),
}

export default pollersConfig