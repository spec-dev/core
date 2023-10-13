import { Contract } from '../entities/Contract'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'
import { ILike, MoreThanOrEqual } from 'typeorm'

const contractsRepo = () => CoreDB.getRepository(Contract)

export async function createContract(
    namespaceId: number,
    name: string,
    desc: string
): Promise<Contract> {
    const contract = new Contract()
    contract.uid = uuid4()
    contract.name = name
    contract.desc = desc
    contract.namespaceId = namespaceId

    try {
        await contractsRepo().save(contract)
    } catch (err) {
        logger.error(
            `Error creating Contract(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return contract
}

export async function upsertContracts(
    data: {
        namespaceId: number
        name: string
        desc: string
    }[]
): Promise<Contract[] | null> {
    let contracts = data.map((entry) => {
        const contract = new Contract()
        contract.uid = uuid4()
        contract.name = entry.name
        contract.desc = entry.desc
        contract.namespaceId = entry.namespaceId
        return contract
    })

    try {
        contracts = await contractsRepo().save(contracts)
    } catch (err) {
        logger.error(`Error upserting contracts: ${err}`)
        return null
    }

    return contracts
}

export async function upsertContractWithTx(
    namespaceId: number,
    name: string,
    desc: string,
    tx: any
): Promise<Contract | null> {
    const data = { namespaceId, name, desc, uid: uuid4() }
    return (
        (
            await tx
                .createQueryBuilder()
                .insert()
                .into(Contract)
                .values(data)
                .orUpdate(['desc'], ['namespace_id', 'name'])
                .returning('*')
                .execute()
        ).generatedMaps[0] || null
    )
}

export async function getAllContractGroups(
    filters: StringKeyMap,
    timeSynced: string = null
): Promise<Contract[] | null> {
    try {
        return await contractsRepo().find({
            relations: { namespace: true, contractInstances: true },
            select: {
                id: true,
                name: true,
                createdAt: true,
                namespace: {
                    name: true,
                    slug: true,
                    hasIcon: true,
                    verified: true,
                    blurhash: true,
                },
                contractInstances: {
                    chainId: true,
                },
            },
            where: {
                namespace: {
                    slug: ILike(filters.namespace ? `%.contracts.${filters.namespace}.%` : '%'),
                },
                updatedAt: MoreThanOrEqual(new Date(timeSynced)),
            },
            order: { createdAt: 'DESC' },
        })
    } catch (err) {
        logger.error(`Error getting Contract Groups: ${err}`)
        return null
    }
}

export async function getOldestContractInGroup(group: string): Promise<Contract[] | null> {
    try {
        return await contractsRepo().find({
            select: {
                id: true,
                name: true,
                createdAt: true,
            },
            where: {
                namespace: {
                    slug: ILike(`%.contracts.${group}`),
                },
            },
            order: { createdAt: 'ASC' },
            take: 1,
        })
    } catch (err) {
        logger.error(`Error getting oldest contract in group ${group}: ${err}`)
        return null
    }
}
