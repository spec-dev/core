import { ContractInstance } from '../entities/ContractInstance'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { toNamespaceSlug, unique } from '../../../utils/formatters'
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
                        slug: toNamespaceSlug(group),
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

export async function getChainIdsForContractGroups(groups: string[]): Promise<string[] | null> {
    let contractInstances: ContractInstance[] = []
    try {
        contractInstances = await contractInstancesRepo().find({
            select: { chainId: true },
            relations: {
                contract: {
                    namespace: true,
                },
            },
            where: {
                contract: {
                    namespace: {
                        slug: In(groups.map(toNamespaceSlug)),
                    },
                },
            },
        })
    } catch (err) {
        logger.error(`Error finding ContractInstances in groups ${groups.join(', ')}: ${err}`)
        return null
    }
    return unique(contractInstances.map((ci) => ci.chainId))
}
