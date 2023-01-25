import { ev, config, StringKeyMap } from '../../shared'

const delayedJobsConfig: StringKeyMap = {
    ...config,
    DELAYED_JOB_CONCURRENCY_LIMIT: Number(ev('DELAYED_JOB_CONCURRENCY_LIMIT', 3)),
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
    POLYGONSCAN_API_KEY: ev('POLYGONSCAN_API_KEY'),
    MUMBAISCAN_API_KEY: ev('MUMBAISCAN_API_KEY'),
}

export default delayedJobsConfig
