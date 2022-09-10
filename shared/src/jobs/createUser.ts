import logger from '../lib/logger'
import { CoreDB } from '../lib/core/db/dataSource'
import { exit } from 'process'
import { createUser } from '../lib/core/db/services/userServices'

async function perform(
    email: any,
    firstName: string,
    lastName: string,
    password?: string,
    emailVerified?: boolean
) {
    await CoreDB.initialize()
    emailVerified = [true, 'true'].includes(emailVerified)

    logger.info(`Creating user ${email}...`)
    const user = await createUser(email, firstName, lastName, password, emailVerified)
    if (!user) {
        logger.info('Failed.')
        exit(0)
    }

    logger.info('Success.')
    exit(0)
}

export default perform
