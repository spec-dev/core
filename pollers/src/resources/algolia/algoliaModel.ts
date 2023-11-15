import { StringKeyMap } from '../../../../shared'

export class AlgoliaModel {
    
    get resourceName(): string {
        return 'Must be implemented in child class'
    }

    get indexName(): string {
        throw 'Must be implemented in child class'
    }

    get idType(): string {
        throw 'Must be implemented in child class'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        throw 'Must be implemented in child class'
    }
}