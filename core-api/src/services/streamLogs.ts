import { logger, tailLogs, getLastXLogs, sleep } from '../../../shared'
import { codes } from '../utils/requests'
import config from '../config'

export async function streamLogs(projectUid, tail, env, req, res) {
    const keySuffix = env && env !== 'prod' ? `-${env}` : ''
    const streamKey = `${projectUid}${keySuffix}`

    let run = true
    let keepAliveTimer = null

    const cleanup = () => {
        run = false
        keepAliveTimer && clearInterval(keepAliveTimer)
    }
    res.writeHead(codes.SUCCESS, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
    })
    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('destroy', cleanup)
    res.on('error', (err) => {
        logger.error('Streaming log response error', err)
        cleanup()
    })

    let hasEnqueuedOpeningBracket = false
    let hasEnqueuedAnObject = false

    const enqueueLog = (log) => {
        if (!hasEnqueuedOpeningBracket) {
            res.write(new TextEncoder().encode('['))
            hasEnqueuedOpeningBracket = true
        }
        if (!log || !log.message) return
        let str = JSON.stringify(log.ping ? log : log.message)
        if (hasEnqueuedAnObject) {
            str = ',' + str
        }
        const buffer = new TextEncoder().encode(str)
        res.write(buffer)
        hasEnqueuedAnObject = true
    }

    tail = parseInt(tail)
    tail = (Number.isNaN(tail) || tail < 0) ? config.TRAILING_LOGS_BATCH_SIZE : tail
    const trailingLogs = await getLastXLogs(streamKey, tail)
    trailingLogs.forEach((log) => enqueueLog(log))

    keepAliveTimer = setInterval(() => {
        if (!run) return
        try {
            run && enqueueLog({ ping: true, message: 'ping' })
        } catch (err) {}
    }, 15000)

    let lastLogId = '$'
    while (run) {
        try {
            const logs = await tailLogs(streamKey, lastLogId)
            if (!logs?.length) {
                await sleep(10)
                continue
            }
            lastLogId = logs[0].id || '$'
            logs.forEach((log) => enqueueLog(log))
        } catch (err) {
            logger.error('Error tailing logs', err)
            break
        }
    }

    cleanup()
    res.end()
}