import { NamespaceAccessToken, NamespaceAccessTokenScope } from '../entities/NamespaceAccessToken'
import { CoreDB } from '../dataSource'
import logger from '../../../logger'
import uuid4 from 'uuid4'
import { toNamespaceSlug } from '../../../utils/formatters'

const namespaceAccessTokens = () => CoreDB.getRepository(NamespaceAccessToken)

export async function createNamespaceAccessToken(
    namespaceId: number,
    scopes: string[]
): Promise<NamespaceAccessToken> {
    const namespaceAccessToken = new NamespaceAccessToken()
    namespaceAccessToken.uid = uuid4().replace(/-/g, '')
    namespaceAccessToken.namespaceId = namespaceId
    namespaceAccessToken.scopes = (scopes || []).join(',')
    namespaceAccessToken.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) // 1 year

    try {
        await namespaceAccessTokens().save(namespaceAccessToken)
    } catch (err) {
        logger.error(
            `Error creating NamespaceAccessToken(namespaceId=${namespaceId}, scopes=${scopes?.join(
                ','
            )}): ${err}`
        )
        throw err
    }

    return namespaceAccessToken
}

export async function getNamespaceAccessToken(
    uid: string,
    nsp: string
): Promise<NamespaceAccessToken | null> {
    let namespaceAccessToken

    try {
        namespaceAccessToken = await namespaceAccessTokens().findOne({
            relations: {
                namespace: true,
            },
            where: {
                uid,
                namespace: {
                    slug: toNamespaceSlug(nsp),
                },
            },
        })
    } catch (err) {
        logger.error(`Error getting NamespaceAccessToken for uid=${uid}: ${err}`)
        return null
    }

    return namespaceAccessToken
}
