import { ContractInstance } from '../entities/ContractInstance'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import { StringKeyMap } from '../../../types'

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
