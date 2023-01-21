import { DelayedJobSpec } from '../../../shared'
import publishLiveObjectVersion from './publishLiveObjectVersion'
import registerContractInstances from './registerContractInstances'
import upsertAbis from './upsertAbis'

const jobs = {
    publishLiveObjectVersion,
    registerContractInstances,
    upsertAbis,
}

export function getJob(spec: DelayedJobSpec) {
    const jobGetter = jobs[spec.name]
    if (!jobGetter) return null
    return jobGetter(spec.params)
}