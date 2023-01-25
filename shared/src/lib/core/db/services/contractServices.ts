import { Contract } from '../entities/Contract'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

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
