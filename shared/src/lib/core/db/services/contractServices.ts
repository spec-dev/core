import { Contract } from '../entities/Contract'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'

const contracts = () => CoreDB.getRepository(Contract)

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
        await contracts().save(contract)
    } catch (err) {
        logger.error(
            `Error creating Contract(name=${name}, desc=${desc}) for Namespace(id=${namespaceId}): ${err}`
        )
        throw err
    }

    return contract
}
