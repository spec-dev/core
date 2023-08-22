import { StringKeyMap, formatAsLatestLiveObject, getLiveObjectVersionsToSync, logger } from '../../../../shared'
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
            const lovs = syncAll === 'true' ? await getLiveObjectVersionsToSync() : await getLiveObjectVersionsToSync(timeSynced)
            return lovs.map(lov => formatAsLatestLiveObject(lov))
        } catch (err) {
            logger.error(`Error formatting LiveObjectVersions updated since last sync at ${timeSynced}: ${err}`)
        }
    }
}