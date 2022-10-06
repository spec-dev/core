import JSONStream from 'JSONStream'
import { logger } from '../../../shared'
import codes from './codes'

export function streamQuery(stream, conn, res) {
    res.writeHead(codes.SUCCESS, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
    })
    res.on('close', () => {
        logger.info('Response closed.')
        cleanupStream(stream, conn)
    })
    res.on('destroy', () => {
        logger.info('Response destroyed.')
        cleanupStream(stream, conn)
    })
    res.on('error', err => {
        logger.error('Stream response error', err)
        cleanupStream(stream, conn)
    })
    stream.on('error', err => {
        logger.error('Stream error', err)
        cleanupStream(stream, conn)
        res.end()
    })
    const jsonPipe = JSONStream.stringify()
    jsonPipe.on('error', err => {
        logger.error('JSON Stream error', err)
        cleanupStream(stream, conn)
        res.end()
    })
    stream.pipe(jsonPipe).pipe(res)
}

export function cleanupStream(stream, conn) {
    try { stream.destroyed || stream.destroy() } catch {}
    conn.release()
}