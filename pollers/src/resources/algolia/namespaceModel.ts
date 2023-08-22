import { StringKeyMap, getNamespaces } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class NamespaceModel extends AlgoliaModel {
    
    get resourceName(): string {
        return 'namespace'
    }

    get indexName(): string {
        return 'namespace_sync'
    }

    get idType(): string {
        return 'id'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        const namespaces = syncAll === 'true' ? await getNamespaces([]) : await getNamespaces([], timeSynced)
        return await Promise.all(namespaces.map(n => n.publicView()))
    }
}