import { verifyJWT } from '../../../shared'
import config from './config'
import { StringKeyMap } from './types'

export function authRequest(req: any): StringKeyMap {
    const headers = req.headers || {}
    const jwt = headers[config.AUTH_HEADER_NAME] || headers[config.AUTH_HEADER_NAME.toLowerCase()]
    if (!jwt) return null
    return verifyJWT(jwt) || {}
}