import { ContractInstance } from '../entities/ContractInstance'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const contractInstances = () => CoreDB.getRepository(ContractInstance)

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
        await contractInstances().save(contractInstance)
    } catch (err) {
        logger.error(
            `Error creating ContractInstance(address=${address}, name=${name}, contractId=${contractId}): ${err}`
        )
        throw err
    }

    return contractInstance
}
