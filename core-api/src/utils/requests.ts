import { User, deserializeToken, getSession } from '../../../shared'
import config from '../config'

export const errors = {
    INVALID_PAYLOAD: 'Invalid payload',
    INVALID_CREDENTIALS: 'Invalid credentials',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Unauthorized request',
    NO_FILE_PROVIDED: 'No file provided',
    INVALID_FILE_TYPE: 'Invalid file type',
    NO_SPEC_INSTANCE: 'No Spec instance exists for project',
}

export const codes = {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
}

export async function authorizeRequest(req, res): Promise<User | null> {
    const headers = req.headers || {}

    // Get auth header token.
    const authHeader = headers[config.USER_AUTH_HEADER_NAME] || headers[config.USER_AUTH_HEADER_NAME.toLowerCase()]
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
    const adminHeader = headers[config.ADMIN_AUTH_HEADER_NAME] || headers[config.ADMIN_AUTH_HEADER_NAME.toLowerCase()]
    if (!adminHeader || adminHeader !== config.CORE_API_ADMIN_TOKEN) {
        res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
        return false
    }
    return true
}