import { User, deserializeToken, getSession } from '../../../shared'
import config from '../config'

export const errors = {
    INVALID_PAYLOAD: 'Invalid payload',
    INVALID_CREDENTIALS: 'Invalid credentials',
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Unauthorized request',
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
    // Get auth header token.
    const authHeader = req.headers.get(config.USER_AUTH_HEADER_NAME)
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