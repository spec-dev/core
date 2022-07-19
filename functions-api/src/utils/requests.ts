import { parse, stringify } from './json'

export const methods = {
    GET: 'GET',
    POST: 'POST'
}

export const errorMsg = {
    FUNCTION_NOT_FOUND: 'function not found',
    MALFORMED_VERSION: 'malformed function version',
}

export async function parsePayload(req) {
    return new Promise(resolve => {
        let data = ''
        req.on('data', chunk => {
            data += chunk
        })
        req.on('end', () => {
            resolve(parse(data))
        })
    })
}

export function jsonResp(res, data = {}) {
    res.setHeader('Content-Type', 'application/json')
    return res.end(stringify(data))
}

export function successResp(res, data) {
    res.statusCode = 200
    return jsonResp(res, { data, error: null })
}

export function errorResp(res, error) {
    return jsonResp(res, { error, data: null })
}