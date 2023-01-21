import { DelayedJobSpec } from '../../../shared'
import upsertAbis from './upsertAbis'
import registerContractInstances from './registerContractInstances'

const jobs = {
    registerContractInstances,
    upsertAbis,
}

export function getJob(spec: DelayedJobSpec) {
    const jobGetter = jobs[spec.name]
    if (!jobGetter) return null
    return jobGetter(spec.params)
}