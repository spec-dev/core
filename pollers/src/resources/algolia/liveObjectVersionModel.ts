import { StringKeyMap, formatAlgoliaLiveObject, getLiveObjectVersionsToSync, logger } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class LiveObjectVersionModel extends AlgoliaModel {

    get resourceName(): string {
        return 'live object version'
    }

    get indexName(): string {
        return 'live_object_version_sync'
    }

    get idType(): string {
        return 'id'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        try {
            const liveObjectVersions = syncAll === 'true' ? await getLiveObjectVersionsToSync() : await getLiveObjectVersionsToSync(timeSynced)
            return liveObjectVersions.map(lov => formatAlgoliaLiveObject(lov))
        } catch (err) {
            logger.error(`Error getting live object versions for Algolia: ${err}`)
        }
    }
}