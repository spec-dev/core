import { verifyJWT } from '../../../shared'
import config from './config'

export function authRequest(req: any): string | null {
    const headers = req.headers || {}
    const jwt = headers[config.AUTH_HEADER_NAME] || headers[config.AUTH_HEADER_NAME.toLowerCase()]
    console.log('headers', headers)
    console.log('jwt', jwt)
    if (!jwt) return null
    const claims = verifyJWT(jwt)
    console.log('claims', claims)
    return claims?.role || null
}