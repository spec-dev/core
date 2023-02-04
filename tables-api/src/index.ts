import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import paths from './lib/paths'
import errors from './lib/errors'
import { specEnvs, logger } from '../../shared'
import { getQueryPayload, getTxPayload } from './lib/payload'
import { performQuery, performTx, createQueryStream } from './lib/db'
import { streamQuery, cleanupStream } from './lib/stream'
import { authRequest } from './lib/auth'

// Create Express app.
const app = express()
app.use(express.json())
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

// Health check route.
app.get(paths.HEALTH_CHECK, (_, res) => res.sendStatus(200))

// Basic query route.
app.post(paths.QUERY, async (req, res) => {
    const role = authRequest(req)
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    let records = []
    try {
        records = await performQuery(query, role)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    return res.status(codes.SUCCESS).json(records)
})

// Transaction route.
app.post(paths.TRANSACTION, async (req, res) => {
    const role = authRequest(req)
    const [queries, isValid] = getTxPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, queries)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Perform all given queries in a single transaction.
    let resp = []
    try {
        resp = await performTx(queries, role)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    return res.status(codes.SUCCESS).json(resp)
})

// Stream query route.
app.post(paths.STREAM_QUERY, async (req, res) => {
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Create a query stream and stream the response.
    let stream, conn
    try {
        ;([stream, conn] = await createQueryStream(query))
        streamQuery(stream, conn, res)
    } catch (error) {
        logger.error(error)
        cleanupStream(stream, conn)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    // Ensure stream closes when a request is cancelled.
    req.on('close', () => {
        logger.info('Request closed.')
        cleanupStream(stream, conn)
    })
})

;(async () => {
    const server = app.listen(config.PORT, () => logger.info(`Listening on port ${config.PORT}...`))
    server.timeout = 0
    server.keepAliveTimeout = 0
    server.headersTimeout = 0
})()