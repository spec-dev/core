import { DelayedJobSpec } from '../../../shared'
import decodeContractInteractions from './decodeContractInteractions'
import indexLiveObjectVersions from './indexLiveObjectVersions'
import publishLiveObjectVersion from './publishLiveObjectVersion'
import registerContractInstances from './registerContractInstances'
import resetContractGroupEventRecordCounts from './resetContractGroupEventRecordCounts'
import upsertAbis from './upsertAbis'

const jobs = {
    decodeContractInteractions,
    indexLiveObjectVersions,
    publishLiveObjectVersion,
    registerContractInstances,
    resetContractGroupEventRecordCounts,
    upsertAbis,
}

export function getJob(spec: DelayedJobSpec) {
    const jobGetter = jobs[spec.name]
    if (!jobGetter) return null
    return jobGetter(spec.params)
}