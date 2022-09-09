import { User } from '../entities/User'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'

const users = () => CoreDB.getRepository(User)

export async function getUserByEmail(email: string): Promise<User | null> {
    try {
        return await users().findOneBy({ email: email.toLowerCase() })
    } catch (err) {
        logger.error(`Error finding User by email ${email}: ${err}`)
        return null
    }
}