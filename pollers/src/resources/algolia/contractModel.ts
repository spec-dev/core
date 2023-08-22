import { StringKeyMap, buildIconUrl, chainIdForContractNamespace, contractGroupNameFromNamespace, getAllContractGroups } from '../../../../shared'
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
        const contracts = syncAll === 'true' ? await getAllContractGroups({}) : await getAllContractGroups({}, timeSynced)
        const groups:StringKeyMap = {}
        const groupedContracts = []

        contracts.forEach(contract => {
            const groupName = contractGroupNameFromNamespace(contract.namespace.slug)
            if (!groupName) return

            const chainId = chainIdForContractNamespace(contract.namespace.slug)
            const icon = buildIconUrl(groupName.split('.')[0]) || null
            groups[groupName] = groups[groupName] || 
                { 
                    uid: contract.uid,
                    chainIds: [], 
                    contractCount: 0, 
                    icon: icon,
                }
            groups[groupName].chainIds.push(chainId)
            groups[groupName].contractCount += contract.contractInstances.length
        })

        Object.entries(groups).forEach(([groupName, values]) => 
            groupedContracts.push({ 
                groupName, 
                ...values 
            })
        )

        return groupedContracts
    }
}