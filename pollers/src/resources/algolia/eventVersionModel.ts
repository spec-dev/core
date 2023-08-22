import { StringKeyMap, buildIconUrl, chainIdForContractNamespace, getEventVersions, isContractNamespace } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class EventVersionModel extends AlgoliaModel {

    get resourceName(): string {
        return 'event'
    }

    get indexName(): string {
        return 'event_version_sync'
    }

    get idType(): string {
        return 'uid'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        const eventVersions = syncAll === 'true' ? await getEventVersions({}) : await getEventVersions({}, timeSynced)
        const formattedEventVersions = []

        eventVersions.forEach(version => {
            const chainIds = chainIdForContractNamespace(version.event.namespace.slug)
            const isContractEvent = isContractNamespace(version.event.namespace.name)
            const icon = (isContractEvent 
                ? buildIconUrl(version.event.namespace.name.split('.')[2])
                : buildIconUrl(version.event.namespace.name)) 
                || null   
            formattedEventVersions.push({...version, chainIds: chainIds, icon: icon})
        })

        return formattedEventVersions
    }
}