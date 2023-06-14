import { NamespaceAccessToken, NamespaceAccessTokenScope } from '../entities/NamespaceAccessToken'
import { Namespace } from '../entities/Namespace'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { StringKeyMap } from '../../../types'

const namespaceAccessTokens = () => CoreDB.getRepository(NamespaceAccessToken)
const namespaces = () => CoreDB.getRepository(Namespace)

export async function createNamespaceAccessToken(
    namespaceId: number,
    scopes: string
): Promise<NamespaceAccessToken> {
    const namespace = await namespaces().findOneBy({
        id: namespaceId,
    })

    const namespaceAccessToken = new NamespaceAccessToken()

    namespaceAccessToken.uid = uuid4()
    namespaceAccessToken.namespaceId = namespace.id
    namespaceAccessToken.namespace = namespace

    const isSupportedScope = scopes
        .split(',')
        .some((item) =>
            Object.values(NamespaceAccessTokenScope).includes(item as NamespaceAccessTokenScope)
        )
    if (!isSupportedScope) {
        logger.error(`Invalid scopes: ${scopes}`)
        return
    }
    namespaceAccessToken.scopes = scopes
    namespaceAccessToken.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) // 1 year
    try {
        await namespaceAccessTokens().save(namespaceAccessToken)
    } catch (err) {
        logger.error(
            `Error creating NamespaceAccessToken(namespaceId=${namespaceId}, scopes=${scopes}): ${err}`
        )
        throw err
    }

    return namespaceAccessToken
}

export async function getNamespaceAccessToken(uid: string): Promise<NamespaceAccessToken | null> {
    let namespaceAccessToken

    try {
        namespaceAccessToken = await namespaceAccessTokens().findOneBy({
            uid,
        })
    } catch (err) {
        logger.error(`Error getting NamespaceAccessToken for uid=${uid}: ${err}`)
        return null
    }

    return namespaceAccessToken
}
