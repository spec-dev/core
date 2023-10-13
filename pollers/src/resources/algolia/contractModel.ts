import { StringKeyMap, formatAlgoliaContracts, getAllContractGroups, logger } from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class ContractModel extends AlgoliaModel {

    get resourceName(): string {
        return 'contract'
    }

    get indexName(): string {
        return 'contract_sync'
    }

    get idType(): string {
        return 'uid'
    }

    async getUpdated(timeSynced: string, syncAll: string): Promise<StringKeyMap[]> {
        try {
            const contracts = syncAll === 'true' ? await getAllContractGroups({}) : await getAllContractGroups({}, timeSynced)
            return formatAlgoliaContracts(contracts)
        } catch (err) {
            logger.error(`Error getting contracts for Algolia: ${err}`)
        }
    }
}