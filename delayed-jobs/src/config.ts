import { ev, config, StringKeyMap } from '../../shared'

const delayedJobsConfig: StringKeyMap = {
    ...config,
    DELAYED_JOB_CONCURRENCY_LIMIT: Number(ev('DELAYED_JOB_CONCURRENCY_LIMIT', 5)),
}

export default delayedJobsConfig
