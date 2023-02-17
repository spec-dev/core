import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import paths from './lib/paths'
import errors from './lib/errors'
import { specEnvs, logger } from '../../shared'
import { getQueryPayload, getTxPayload } from './lib/payload'
import { performQuery, performTx, createQueryStream, loadSchemaRoles } from './lib/db'
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

/**
 * Perform a basic query.
 */
app.post(paths.QUERY, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const role = authRequest(req)
    // if (!role) {
    //     logger.error(errors.UNAUTHORIZED)
    //     return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    // }

    // Parse sql and bindings from payload.
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Run query and return JSON array of results.
    let records = []
    try {
        records = await performQuery(query, role)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }
    return res.status(codes.SUCCESS).json(records)
})

/**
 * Perform a database transaction with a series of queries.
 */
app.post(paths.TRANSACTION, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const role = authRequest(req)
    // if (!role) {
    //     logger.error(errors.UNAUTHORIZED)
    //     return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    // }

    // Get list of queries to run inside a transaction.
    const [queries, isValid] = getTxPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, queries)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Perform all given queries in a single transaction & return JSON array of results.
    let resp = []
    try {
        resp = await performTx(queries, role)
    } catch (error) {
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }
    return res.status(codes.SUCCESS).json(resp)
})

/**
 * Perform a query & stream the results in realtime as a readable stream.
 */
app.post(paths.STREAM_QUERY, async (req, res) => {
    // Auth the JWT to get RBAC role.
    const role = authRequest(req)
    // if (!role) {
    //     logger.error(errors.UNAUTHORIZED)
    //     return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    // }

    // Parse sql and bindings from payload.
    const [query, isValid] = getQueryPayload(req.body)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Create a query stream and stream the response.
    let stream, conn
    try {
        ;([stream, conn] = await createQueryStream(query, role))
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
    // Start polling shared tables for the existing schema roles.
    await loadSchemaRoles()
    setInterval(() => loadSchemaRoles(), config.LOAD_SCHEMA_ROLES_INTERVAL)

    // Start express server.
    const server = app.listen(config.PORT, () => (
        logger.info(`Listening on port ${config.PORT}...`)
    ))
    server.timeout = 0
    server.keepAliveTimeout = 0
    server.headersTimeout = 0
})()