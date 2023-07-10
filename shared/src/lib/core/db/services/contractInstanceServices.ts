import { ContractInstance } from '../entities/ContractInstance'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toNamespaceSlug } from '../../../utils/formatters'
import { supportedChainIds, contractNamespaceForChainId } from '../../../utils/chainIds'
import { StringKeyMap } from '../../../types'
import { In } from 'typeorm'

const contractInstancesRepo = () => CoreDB.getRepository(ContractInstance)

export async function createContractInstance(
    contractId: number,
    chainId: string,
    address: string,
    name: string,
    desc?: string | null
): Promise<ContractInstance> {
    const contractInstance = new ContractInstance()
    contractInstance.chainId = chainId
    contractInstance.address = address
    contractInstance.name = name
    contractInstance.desc = desc
    contractInstance.contractId = contractId

    try {
        await contractInstancesRepo().save(contractInstance)
    } catch (err) {
        logger.error(
            `Error creating ContractInstance(address=${address}, name=${name}, contractId=${contractId}): ${err}`
        )
        throw err
    }

    return contractInstance
}

export async function upsertContractInstancesWithTx(
    data: StringKeyMap[],
    tx: any
): Promise<ContractInstance[]> {
    return (
        await tx
            .createQueryBuilder()
            .insert()
            .into(ContractInstance)
            .values(data)
            .orUpdate(['name', 'desc'], ['address', 'chain_id', 'contract_id'])
            .returning('*')
            .execute()
    ).generatedMaps
}

export async function getContractInstancesInNamespace(
    nsp: string
): Promise<ContractInstance[] | null> {
    try {
        return await contractInstancesRepo().find({
            relations: {
                contract: {
                    namespace: true,
                },
            },
            where: {
                contract: {
                    namespace: {
                        slug: toNamespaceSlug(nsp),
                    },
                },
            },
        })
    } catch (err) {
        logger.error(`Error finding ContractInstances in namespace ${nsp}: ${err}`)
        return null
    }
}

export async function getContractInstancesInGroup(group: string): Promise<StringKeyMap | null> {
    const fullNamespaceNames: string[] = []
    for (const supportedChainId of supportedChainIds) {
        const nspForChainId = contractNamespaceForChainId(supportedChainId)
        const fullPath = `${nspForChainId}.${group}`
        fullNamespaceNames.push(toNamespaceSlug(fullPath))
    }

    let contractInstances: ContractInstance[] = []
    try {
        contractInstances = await contractInstancesRepo().find({
            relations: {
                contract: {
                    namespace: true,
                },
            },
            where: {
                contract: {
                    namespace: {
                        slug: In(fullNamespaceNames),
                    },
                },
            },
        })
    } catch (err) {
        logger.error(`Error finding ContractInstances in group ${group}: ${err}`)
        return null
    }

    const instanceMap: StringKeyMap = {}
    for (const result of contractInstances) {
        const { address, name, desc, chainId, createdAt } = result
        const entry = {
            address,
            name,
            desc,
            chainId,
            createdAt,
        }
        instanceMap[chainId] = instanceMap[chainId] ? instanceMap[chainId].concat([entry]) : [entry]
    }
    return instanceMap
}
