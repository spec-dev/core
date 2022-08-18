import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import paths from './lib/paths'
import errors from './lib/errors'
import { specEnvs, logger } from 'shared'
import { getQueryPayload } from './lib/payload'
import { performQuery, createQueryStream } from './lib/db'
import { streamQuery, cleanupStream } from './lib/stream'

// Create Express app.
const app = express()
app.use(express.json())
if (config.ENV !== specEnvs.PROD) {
    app.use(morgan('dev'))
}

// Health check routes.
app.get(paths.READY, (_, res) => res.sendStatus(200))
app.get(paths.LIVE, (_, res) => res.sendStatus(200))

// Basic query route.
app.post(paths.QUERY, async (req, res) => {
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    let records = []
    try {
        records = await performQuery(query)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    return res.status(codes.SUCCESS).json(records)
})

// Stream query route.
app.post(paths.STREAM_QUERY, async (req, res) => {
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Create a query stream and stream the response.
    let stream
    try {
        stream = await createQueryStream(query)
        streamQuery(stream, res)
    } catch (error) {
        logger.error(error)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    // Ensure stream closes when a request is cancelled.
    req.on('close', () => cleanupStream(stream))
})

;(async () => {
    app.listen(config.PORT, () => logger.info(`Listening on port ${config.PORT}...`))
})()