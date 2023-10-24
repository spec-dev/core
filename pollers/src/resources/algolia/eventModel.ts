import { StringKeyMap, formatAlgoliaLiveObject, getEventLiveObjectVersionsToSync, logger } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class EventModel extends AlgoliaModel {

    get resourceName(): string {
        return 'event'
    }

    get indexName(): string {
        return 'event_sync'
    }

    get idType(): string {
        return 'id'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        try {
            const liveObjectVersions = syncAll === 'true' ? await getEventLiveObjectVersionsToSync() : await getEventLiveObjectVersionsToSync(timeSynced)
            return liveObjectVersions.map(lov => formatAlgoliaLiveObject(lov))
        } catch (err) {
            logger.error(`Error getting event live object versions for Algolia events: ${err}`)
        }
    }
}