import { Session } from '../entities/Session'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import config from '../../../config'
import { newSalt, hash } from '../../../utils/auth'
import { StringKeyMap } from '../../../types'

const sessions = () => CoreDB.getRepository(Session)

export async function createSession(userId: number): Promise<Session | null> {
    const createdAtTimestamp = Math.round(Date.now() / 1000)
    const expirationTimestamp = createdAtTimestamp + config.CORE_API_SESSION_LIFETIME * 86400

    const record = new Session()
    record.uid = uuid4()
    record.userId = userId
    record.salt = newSalt()
    record.token = await hash(record.uid, record.salt, createdAtTimestamp)

    let session
    try {
        session =
            (
                await sessions()
                    .createQueryBuilder()
                    .insert()
                    .into(Session)
                    .values({
                        ...record,
                        createdAt: () => `timezone('UTC', to_timestamp(${createdAtTimestamp}))`,
                        expirationDate: () =>
                            `timezone('UTC', to_timestamp(${expirationTimestamp}))`,
                    })
                    .returning('*')
                    .execute()
            ).generatedMaps[0] || null
    } catch (err) {
        logger.error(`Error creating session (user_id=${userId}): ${err}`)
        return null
    }

    return session
}

export async function getSession(
    uid: string,
    token: string,
    opts: StringKeyMap = {}
): Promise<Session | null> {
    const findOpts: StringKeyMap = { where: { uid, token } }

    if (opts.withUser) {
        findOpts.relations = { user: true }
    }

    try {
        return await sessions().findOne(findOpts)
    } catch (err) {
        logger.error(`Error finding Session: ${err}`)
        return null
    }
}
