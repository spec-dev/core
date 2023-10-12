import { 
    StringKeyMap, 
    formatAlgoliaContracts, 
    getAllContractGroups,
    logger, 
} from '../../../../shared'
import { AlgoliaModel } from './algoliaModel'

export class ContractModel extends AlgoliaModel {

    get resourceName(): string {
        return 'contract'
    }

    get idType(): string {
        return 'uid'
    }

    get nspSearchProperty(): string {
        return 'contracts'
    }

    async getData(nsp: string): Promise<StringKeyMap[]> {
        try {
            const contracts = await getAllContractGroups({ namespace: nsp }) || []
            return formatAlgoliaContracts(contracts)
        } catch (err) {
            logger.error(`Error getting contracts for Algolia: ${err}`)
        }
    }
}