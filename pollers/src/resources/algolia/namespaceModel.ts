import { StringKeyMap, formatAlgoliaNamespace, getNamespace, logger } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class NamespaceModel extends AlgoliaModel {

    get resourceName(): string {
        return 'namespace'
    }

    get idType(): string {
        return 'id'
    }

    async getNamespace(nsp: string): Promise<StringKeyMap> {
        try {
            const namespace = await getNamespace(nsp)
            return await formatAlgoliaNamespace(namespace)
        } catch (err) {
            logger.error(`Error getting namespace for Algolia: ${err}`)
        }
    }
}