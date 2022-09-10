import jwt from 'jsonwebtoken'
import config from '../config'
import randToken from 'rand-token'
import bcrypt from 'bcrypt'

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

export function newSalt(): string {
    return randToken.generate(32)
}

export async function hash(...args: any[]): Promise<string> {
    return await bcrypt.hash(args.join(''), 10)
}

export async function verifyHash(hash: string, plainText: string): Promise<boolean> {
    return await bcrypt.compare(plainText, hash)
}

export function serializeToken(idComp: any, secretComp: string): string {
    return encodeURI([idComp, secretComp].join('%'))
}

export function deserializeToken(token: string): string[] | null[] {
    token = decodeURI(token)

    const firstSplitIndex = token.indexOf('%')
    if (firstSplitIndex === -1) {
        return [null, null]
    }

    const idComp = token.slice(0, firstSplitIndex)
    const secretComp = token.slice(firstSplitIndex + 1)
    return [idComp, secretComp]
}
