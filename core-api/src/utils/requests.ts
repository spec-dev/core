import {
    User,
    deserializeToken,
    getSession,
    verifyJWT,
    getNamespaceAccessToken,
} from '../../../shared'
import { userHasNamespacePermissions } from './auth'
import config from '../config'

export const errors = {
    INVALID_PAYLOAD: 'Invalid payload',
    INVALID_CREDENTIALS: 'Invalid credentials',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Unauthorized request',
    FORBIDDEN: `Permission denied`,
    NO_FILE_PROVIDED: 'No file provided',
    INVALID_FILE_TYPE: 'Invalid file type',
    NO_SPEC_INSTANCE: 'No Spec instance exists for project',
    UNKNOWN_ERROR: 'Unknown error',
    JOB_SCHEDULING_FAILED: 'Failed to schedule job',
    NAMESPACE_NOT_FOUND: 'Namespace not found',
    CONTRACT_GROUP_NOT_FOUND: 'Contract Group not found',
    LIVE_OBJECT_NOT_FOUND: 'Live Object not found',
    LIVE_OBJECT_VERSION_NOT_FOUND: 'Live Object Version not found',
    NAMESPACE_MISSING_CODE_URL:
        'Namespace does not have a remote git repository assigned to it yet.',
    VERSIONS_MUST_INCREASE: 'Version numbers must always increase',
    CONTRACT_INSTANCE_NOT_FOUND: 'Contract instance not found',
    INTERNAL_ERROR: 'Internal server error',
}

export const codes = {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
}

export async function authorizeRequestForNamespace(
    req: any,
    res: any,
    namespaceName: string,
    allowedScopes: string[]
): Promise<boolean> {
    const headers = req.headers || {}

    // Get user auth header token.
    const userAuthHeader =
        headers[config.USER_AUTH_HEADER_NAME] || headers[config.USER_AUTH_HEADER_NAME.toLowerCase()]

    // user auth token authorization
    if (userAuthHeader) {
        const user = await authorizeRequest(req, res)

        // Check if user has permissions to access namespace.
        const { canAccess } = await userHasNamespacePermissions(user.id, namespaceName)
        if (!canAccess) {
            res.status(codes.FORBIDDEN).json({ error: errors.FORBIDDEN })
            return false
        }

        return true
    }

    // Get namespace auth header token.
    const namespaceAuthHeader =
        headers[config.NAMESPACE_AUTH_HEADER_NAME] ||
        headers[config.NAMESPACE_AUTH_HEADER_NAME.toLowerCase()]

    if (namespaceAuthHeader) {
        const namespaceAccessToken = await getNamespaceAccessToken(
            namespaceAuthHeader,
            namespaceName
        )
        const hasPerms =
            namespaceAccessToken &&
            new Date(namespaceAccessToken.expiresAt) > new Date() &&
            namespaceAccessToken.scopes?.split(',').some((scope) => allowedScopes.includes(scope))
        if (!hasPerms) {
            res.status(codes.FORBIDDEN).json({ error: errors.FORBIDDEN })
            return false
        }
        return true
    }

    return false
}

export async function authorizeRequest(req, res): Promise<User | null> {
    const headers = req.headers || {}

    // Get auth header token.
    const authHeader =
        headers[config.USER_AUTH_HEADER_NAME] || headers[config.USER_AUTH_HEADER_NAME.toLowerCase()]
    if (!authHeader) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return null
    }

    // Parse header token into session components.
    const [sessionUid, sessionToken] = deserializeToken(authHeader)
    if (!sessionUid || !sessionToken) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return null
    }

    // Get session (with user) for uid/token.
    const session = await getSession(sessionUid, sessionToken, { withUser: true })
    if (!session) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return null
    }

    return session.user || null
}

export async function authorizeAdminRequest(req, res): Promise<boolean> {
    const headers = req.headers || {}
    const adminHeader =
        headers[config.ADMIN_AUTH_HEADER_NAME] ||
        headers[config.ADMIN_AUTH_HEADER_NAME.toLowerCase()]
    if (!adminHeader || adminHeader !== config.CORE_API_ADMIN_TOKEN) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return false
    }
    return true
}

export async function authorizeRequestWithProjectApiKey(req, res): Promise<boolean> {
    const headers = req.headers || {}
    const jwt = headers[config.AUTH_HEADER_NAME] || headers[config.AUTH_HEADER_NAME.toLowerCase()]
    if (!jwt || !verifyJWT(jwt)) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return false
    }
    return true
}
