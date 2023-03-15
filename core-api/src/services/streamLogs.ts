import { logger, tailLogs, getLastXLogs, sleep } from '../../../shared'
import { codes } from '../utils/requests'
import config from '../config'

export async function streamLogs(projectUid, env, req, res) {
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
    res.on('error', err => {
        logger.error(i, 'Streaming log response error', err)
        cleanup()
    })

    let hasEnqueuedOpeningBracket = false
    let hasEnqueuedAnObject = false

    const enqueueLog = log => {
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

    logger.info(i, 'Getting last X logs...')

    const trailingLogs = await getLastXLogs(streamKey, config.TRAILING_LOGS_BATCH_SIZE)
    trailingLogs.forEach(log => enqueueLog(log))

    logger.info(i, 'Creating interval...')

    keepAliveTimer = setInterval(() => {
        if (!run) return
        try {
            run && enqueueLog({ ping: true, message: 'ping' })
        } catch (err) {}
    }, 15000)
    
    logger.info(i, 'Creating infinite loop...')

    let lastLogId = '$'
    while (run) {
        try {
            const logs = await tailLogs(streamKey, lastLogId)
            if (!logs?.length) {
                await sleep(10)
                continue
            }
            lastLogId = logs[0].id || '$'
            logs.forEach(log => enqueueLog(log))
        } catch(err) {
            logger.error('Error tailing logs', err)
            break
        }
    }

    logger.info(i, 'BELOW LOOP')

    cleanup()
    res.end()
}