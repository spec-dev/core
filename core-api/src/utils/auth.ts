import { AGServerSocket } from 'socketcluster-server'
import { logger, ClaimRole, CoreDB, Project, StringKeyMap, NamespaceUser, toSlug, NamespaceUserRole } from '../../../shared'

const projects = () => CoreDB.getRepository(Project)
const namespaceUsers = () => CoreDB.getRepository(NamespaceUser)

const tieredNamespaceUserPermissions = [
    NamespaceUserRole.Member,
    NamespaceUserRole.Admin,
    NamespaceUserRole.Owner,
]

export async function authConnection(authKey: AGServerSocket.AuthToken): Promise<boolean> {
    if (authKey.role !== ClaimRole.Admin || !authKey.key) return false
    return await projectExistsWithAdminKey(authKey.key)
}

export async function projectExistsWithAdminKey(adminKey: string): Promise<boolean> {
    try {
        return (await projects().findOne({ where: { adminKey }, select: { id: true } })) !== null
    } catch (err) {
        logger.error(`Error finding Project by admin key: ${err}`)
        return false
    }
}

export async function userHasNamespacePermissions(
    userId: number, 
    nsp: string, // slug or name
    requiredRole: NamespaceUserRole = NamespaceUserRole.Member,
): Promise<StringKeyMap | null> {
    let namespaceUser = null
    try {
        namespaceUser = await namespaceUsers().findOne({
            relations: {
                namespace: true,
            },
            where: {
                userId: userId,
                namespace: {
                    slug: toSlug(nsp),
                },
            },
        })
    } catch (err) {
        logger.error(`Error finding NamespaceUser by userId=${userId}, nsp=${nsp}: ${err}`)
        return null
    }

    let canAccess = false
    if (!namespaceUser) {
        return { canAccess, namespaceUser }
    }

    // Ensure the "tier" of the namespace user's role meets *at least* the required tier.
    const currentAccessTier = tieredNamespaceUserPermissions.indexOf(namespaceUser.role)
    const requiredAccessTier = tieredNamespaceUserPermissions.indexOf(requiredRole)
    canAccess = currentAccessTier >= requiredAccessTier

    return { canAccess, namespaceUser }
}

// TODO: auth route
// export async function tokenHasNamespacePermissions()