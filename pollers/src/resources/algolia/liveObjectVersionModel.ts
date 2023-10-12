import { StringKeyMap, formatAlgoliaLiveObject, getLiveObjectVersionsByNamespace, logger } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class LiveObjectVersionModel extends AlgoliaModel {

    get resourceName(): string {
        return 'live object version'
    }

    get idType(): string {
        return 'id'
    }

    get nspSearchProperty(): string {
        return 'liveObjects'
    }

    async getData(nsp: string): Promise<StringKeyMap[]> {
        try {
            const liveObjectVersions = await getLiveObjectVersionsByNamespace(nsp)
            return liveObjectVersions.map(lov => formatAlgoliaLiveObject(lov))
        } catch (err) {
            logger.error(`Error getting live object versions for Algolia: ${err}`)
        }
    }
}