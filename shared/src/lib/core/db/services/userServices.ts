import { User } from '../entities/User'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { newSalt, hash } from '../../../utils/auth'

const users = () => CoreDB.getRepository(User)

export async function createUser(
    email: string,
    firstName: string,
    lastName: string,
    password?: string,
    emailVerified?: boolean
): Promise<User> {
    const user = new User()
    user.uid = uuid4()
    user.email = email
    user.firstName = firstName
    user.lastName = lastName
    user.salt = newSalt()

    if (password) {
        user.hashedPw = await hash(password, user.salt)
    }

    if (emailVerified) {
        user.emailVerified = true
    }

    try {
        await users().save(user)
    } catch (err) {
        logger.error(`Error creating User with email ${email}): ${err}`)
        return null
    }

    return user
}

export async function getUserByEmail(email: string): Promise<User | null> {
    try {
        return await users().findOneBy({ email: email.toLowerCase() })
    } catch (err) {
        logger.error(`Error finding User by email ${email}: ${err}`)
        return null
    }
}
