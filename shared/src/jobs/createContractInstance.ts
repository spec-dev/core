import { createContractInstance } from '../lib/core/db/services/contractInstanceServices'
import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'

async function perform(contractId: any, chainId: any, address: string, name: string, desc?: string) {
    await CoreDB.initialize()

    logger.info(`Creating contract instance ${name}...`)

    const contractInstance = await createContractInstance(
        Number(contractId),
        Number(chainId),
        address,
        name,
        desc || null,
    )

    logger.info('Success', contractInstance.id)
    exit(0)
}

export default perform