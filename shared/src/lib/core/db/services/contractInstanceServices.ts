import { ContractInstance } from '../entities/ContractInstance'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
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

export async function upsertContractInstances(
    data: {
        contractId: number
        chainId: string
        address: string
        name: string
        desc?: string | null
    }[]
): Promise<ContractInstance[] | null> {
    let contractInstances = data.map((entry) => {
        const contractInstance = new ContractInstance()
        contractInstance.contractId = entry.contractId
        contractInstance.chainId = entry.chainId
        contractInstance.address = entry.address
        contractInstance.name = entry.name
        contractInstance.desc = entry.desc
        return contractInstance
    })

    try {
        contractInstances = await contractInstancesRepo().save(contractInstances)
    } catch (err) {
        logger.error(`Error upserting contract instances: ${err}`)
        return null
    }

    return contractInstances
}

export async function getContractInstancesByContractId(
    contractIds: number[]
): Promise<ContractInstance[] | null> {
    let contractInstances = []

    try {
        contractInstances = await contractInstancesRepo().find({
            where: { contractId: In(contractIds) },
        })
    } catch (err) {
        logger.error(
            `Error finding ContractInstances for contractIds: ${contractIds.join(', ')}: ${err}`
        )
        return null
    }

    return contractInstances
}
