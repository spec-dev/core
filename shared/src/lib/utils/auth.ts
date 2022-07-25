import jwt from 'jsonwebtoken'
import config from '../config'

export enum ClaimRole {
    EventPublisher = 'event-publisher',
}

export interface Claims {
    role: ClaimRole
}

export function newJWT(claims: Claims, exp: string | number) {
    return jwt.sign(claims, config.JWT_SECRET, {
        expiresIn: exp,
    })
}

export function parseClaims(token: string): { claims: Claims | null; error: string | null } {
    let claims = null
    let error = null
    try {
        claims = jwt.verify(token, config.JWT_SECRET)
    } catch (err) {
        error = err
    }

    return { claims, error }
}

export function canPublishEvents(token: string): boolean {
    const { claims, error } = parseClaims(token)
    if (error || !claims) return false
    return claims.role === ClaimRole.EventPublisher
}
