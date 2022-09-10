import { app } from '../express'
import paths from '../../utils/paths'
import { parseUserLoginPayload } from './userPayloads'
import { logger, getUserByEmail, createSession, verifyHash } from '../../../../shared'
import { codes, errors } from '../../utils/requests'
import config from '../../config'

/**
 * Basic user auth route. Sign in with email/password.
 */
app.post(paths.USER_LOGIN, async (req, res) => {
    // Parse & validate payload.
    const { payload, isValid, error } = parseUserLoginPayload(req.body)
    if (!isValid) {
        return res.status(codes.BAD_REQUEST).json({ error: error || errors.INVALID_PAYLOAD })
    }
    const { email, password } = payload

    // Find user by email.
    const user = await getUserByEmail(email)
    if (!user) {
        logger.error('No user exists for email:', email)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.INVALID_CREDENTIALS })
    }

    // Ensure email has been verified.
    if (!user.emailVerified) {
        logger.error('User attempted login before email was verified:', email)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.INVALID_CREDENTIALS })
    }

    // Validate password.
    if (!(await verifyHash(user.hashedPw, password))) {
        logger.error('Invalid password during sign-in attempt for user:', email)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.INVALID_CREDENTIALS })
    }

    // Create new session for user.
    const session = await createSession(user.id)

    // Return user with new session auth token in header.
    return res
        .status(codes.SUCCESS)
        .header(config.USER_AUTH_HEADER_NAME, session.serializeToken())
        .json(user.selfView())
})