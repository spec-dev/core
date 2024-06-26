import JSONStream from 'JSONStream'
import { logger } from '../../../shared'
import codes from './codes'

export function streamQuery(stream, conn, res) {
    let keepAliveTimer = null
    let streamEnded = false

    res.writeHead(codes.SUCCESS, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
    })
    
    res.on('close', () => {
        logger.info('Response closed.')
        cleanupStream(stream, conn, keepAliveTimer)
    })
    
    res.on('destroy', () => {
        logger.info('Response destroyed.')
        cleanupStream(stream, conn, keepAliveTimer)
    })
    
    res.on('error', err => {
        logger.error('Stream response error', err)
        cleanupStream(stream, conn, keepAliveTimer)
    })
    
    stream.on('error', err => {
        logger.error('Stream error', err)
        cleanupStream(stream, conn, keepAliveTimer)
        res.end()
    })
    
    stream.on('end', () => {
        logger.info(`Query stream ended.`)
        cleanupStream(stream, conn, keepAliveTimer)
        streamEnded = true
    })

    const jsonPipe = JSONStream.stringify()
    jsonPipe.on('error', err => {
        logger.error('JSON Stream error', err)
        cleanupStream(stream, conn, keepAliveTimer)
        res.end()
    })

    keepAliveTimer = setInterval(() => {
        try {
            res.writable && res.write(new TextEncoder().encode(' '))
            streamEnded && res.end()
        } catch (err) {}
    }, 1000)

    stream.pipe(jsonPipe).pipe(res)

    return keepAliveTimer
}

export function cleanupStream(stream, conn, keepAliveTimer?) {
    try { 
        stream.destroyed || stream.destroy()
        conn.release()
        keepAliveTimer && clearInterval(keepAliveTimer)    
    } catch (err) {}
}