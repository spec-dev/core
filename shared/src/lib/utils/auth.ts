import jwt from 'jsonwebtoken'
import config from '../config'
import randToken from 'rand-token'
import bcrypt from 'bcrypt'
import uuid4 from 'uuid4'

export enum ClaimRole {
    EventPublisher = 'event-publisher',
    EventSubscriber = 'event-subscriber',
    Admin = 'admin',
}

export interface Claims {
    id: string
    role: ClaimRole | string
    key: string
}

export function newJWT(claims: Claims, exp: string | number) {
    return jwt.sign(claims, config.JWT_SECRET, {
        expiresIn: exp,
    })
}

export function verifyJWT(token: string): Claims | null {
    try {
        return jwt.verify(token, config.JWT_SECRET) as Claims
    } catch (err) {
        return null
    }
}

export function newSalt(): string {
    return randToken.generate(32)
}

export async function newApiKey(): Promise<string> {
    return (await hash(uuid4())).replace('$2b$10$', '')
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
