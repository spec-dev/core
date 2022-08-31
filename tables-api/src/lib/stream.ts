import JSONStream from 'JSONStream'
import { logger } from '../../../shared'
import codes from './codes'

export function streamQuery(stream, res) {
    res.writeHead(codes.SUCCESS, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
    })
    res.on('close', () => cleanupStream(stream))
    res.on('destroy', () => cleanupStream(stream))
    res.on('error', err => {
        logger.error('Stream response error', err)
        cleanupStream(stream)
    })
    stream.on('error', err => {
        logger.error('Stream error', err)
        stream.push({ error: err.message })
        cleanupStream(stream)
        res.end()
    })
    stream.pipe(JSONStream.stringify()).pipe(res)
}

export function cleanupStream(stream) {
    try { stream.destroyed || stream.destroy() } catch {}
}