import { DelayedJobSpec } from '../../../shared'
import upsertAbis from './upsertAbis'

const jobs = {
    upsertAbis,
}

export function getJob(spec: DelayedJobSpec) {
    const jobGetter = jobs[spec.name]
    if (!jobGetter) return null
    return jobGetter(spec.params)
}