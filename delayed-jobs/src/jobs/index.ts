import { DelayedJobSpec } from '../../../shared'
import decodeContractInteractions from './decodeContractInteractions'
import indexLiveObjectVersions from './indexLiveObjectVersions'
import publishLiveObjectVersion from './publishLiveObjectVersion'
import publishAndDeployLiveObjectVersion from './publishAndDeployLiveObjectVersion'
import registerContractInstances from './registerContractInstances'
import upsertAbis from './upsertAbis'

const jobs = {
    decodeContractInteractions,
    indexLiveObjectVersions,
    publishLiveObjectVersion,
    registerContractInstances,
    publishAndDeployLiveObjectVersion,
    upsertAbis,
}

export function getJob(spec: DelayedJobSpec) {
    const jobGetter = jobs[spec.name]
    if (!jobGetter) return null
    return jobGetter(spec.params)
}