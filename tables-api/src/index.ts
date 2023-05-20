import express from 'express'
import morgan from 'morgan'
import config from './lib/config'
import codes from './lib/codes'
import paths from './lib/paths'
import errors from './lib/errors'
import { getQueryPayload, getTxPayload, isTableOpRestricted } from './lib/payload'
import { performQuery, performTx, createQueryStream, loadSchemaRoles } from './lib/db'
import { streamQuery, cleanupStream } from './lib/stream'
import { authRequest } from './lib/auth'
import { QueryPayload } from '@spec.dev/qb'
import { specEnvs, logger, getFailingTables, getBlockOpsCeiling, supportedChainIds, indexerRedis, indexerRedisKeys } from '../../shared'
import chalk from 'chalk'

const indexerRedisPromise = indexerRedis.connect()
const pipelineCache = {}
const supportedChainIdsArray = Array.from(supportedChainIds)

async function updatePipelineCache() {
    const chainIds = []
    const failingTablesPromises = []
    const blockOpsCeilingPromises = []
    for (const chainId of supportedChainIdsArray) {
        chainIds.push(chainId)
        failingTablesPromises.push(getFailingTables(chainId))
        blockOpsCeilingPromises.push(getBlockOpsCeiling(chainId))
    }
    let updates = []
    try {
        updates = await Promise.all([...failingTablesPromises, ...blockOpsCeilingPromises])
    } catch (err) {
        logger.error(err)
        return
    }
    const failingTablesGroups = updates.slice(0, supportedChainIdsArray.length)
    const blockOpsCeilings = updates.slice(supportedChainIdsArray.length)
    for (let i = 0; i < chainIds.length; i++) {
        const chainId = chainIds[i]
        const failingTables = failingTablesGroups[i] || []
        const blockOpsCeiling = blockOpsCeilings[i] || null
        pipelineCache[chainId] = pipelineCache[chainId] || {}
        pipelineCache[chainId].failingTables = new Set(failingTables)
        pipelineCache[chainId].blockOpsCeiling = blockOpsCeiling
    }
}

const subscribeToNewBlockOpsCeilings = async () => {
    return indexerRedis.subscribe(indexerRedisKeys.FREEZE_ABOVE_BLOCK_UPDATE, async message => {
        let fullUpdate = false
        try {
            const payload = JSON.parse(message)
            const { chainId, blockNumber } = payload
            logger.info(chalk.cyanBright(`New block ops ceiling:`), payload)
            if (chainId) {
                pipelineCache[chainId].blockOpsCeiling = blockNumber
            } else {
                fullUpdate = true
            }
        } catch (err) {
            logger.error(`Redis error on pub/sub message from ${indexerRedisKeys.FREEZE_ABOVE_BLOCK_UPDATE}: ${err}`)
            fullUpdate = true
        }
        fullUpdate && await updatePipelineCache()
    })
}

const subscribeToFailingTableChanges = async () => {
    return indexerRedis.subscribe(indexerRedisKeys.FAILING_TABLES_UPDATE, async message => {
        let fullUpdate = false
        try {
            const payload = JSON.parse(message)
            const { chainId } = payload
            logger.info(chalk.cyanBright(`New failing tables on chain ${chainId}.`))
            if (chainId) {
                pipelineCache[chainId].failingTables = new Set(await getFailingTables(chainId))
            } else {
                fullUpdate = true
            }
        } catch (err) {
            logger.error(`Redis error on pub/sub message from ${indexerRedisKeys.FAILING_TABLES_UPDATE}: ${err}`)
            fullUpdate = true
        }
        fullUpdate && await updatePipelineCache()
    })
}

// Create Express app.
const app = express()
app.use(express.json({ limit: '50mb' }))
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
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    }

    // Parse sql and bindings from payload.
    const [query, isValid] = getQueryPayload(req.body, claims || {})
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Prevent table ops on failing tables or on block numbers that are >= ceiling.
    if (isTableOpRestricted(req.body, query, pipelineCache)) {
        return res.status(codes.SUCCESS).json([])
    }

    // Run query and return JSON array of results.
    let records = []
    try {
        records = await performQuery(query as QueryPayload, role)
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
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    }

    // Get list of queries to run inside a transaction.
    const [queries, isValid] = getTxPayload(req.body, claims || {})
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, queries)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // Prevent table ops on failing tables or on block numbers that are >= ceiling.
    if (isTableOpRestricted(req.body, queries, pipelineCache)) {
        return res.status(codes.SUCCESS).json(queries.map(_ => []))
    }

    // Perform all given queries in a single transaction & return JSON array of results.
    let resp = []
    try {
        resp = await performTx(queries as QueryPayload[], role)
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
    const claims = authRequest(req)
    const role = claims?.role
    if (!role) {
        logger.error(errors.UNAUTHORIZED)
        return res.status(codes.UNAUTHORIZED).json({ error: errors.UNAUTHORIZED })
    }

    // Parse sql and bindings from payload.
    const [query, isValid] = getQueryPayload(req.body, claims)
    if (!isValid) {
        logger.error(errors.INVALID_PAYLOAD, query)
        return res.status(codes.BAD_REQUEST).json({ error: errors.INVALID_PAYLOAD })
    }

    // If  

    // Create a query stream and stream the response.
    let stream, conn, keepAliveTimer
    try {
        ;([stream, conn] = await createQueryStream(query as QueryPayload))
        keepAliveTimer = streamQuery(stream, conn, res)
    } catch (error) {
        logger.error(error)
        cleanupStream(stream, conn, keepAliveTimer)
        return res.status(codes.INTERNAL_SERVER_ERROR).json({ error })
    }

    // Ensure stream closes when a request is cancelled.
    req.on('close', () => {
        logger.info('Request closed.')
        cleanupStream(stream, conn, keepAliveTimer)
    })
})

;(async () => {
    // Start polling shared tables for the existing schema roles.
    await Promise.all([loadSchemaRoles(), indexerRedisPromise])
    setInterval(() => loadSchemaRoles(), config.LOAD_SCHEMA_ROLES_INTERVAL)

    // Listen for updates in the pipeline cache.
    await updatePipelineCache()
    await Promise.all([subscribeToNewBlockOpsCeilings(), subscribeToFailingTableChanges()])

    // Start express server.
    const server = app.listen(config.PORT, () => (
        logger.info(`Listening on port ${config.PORT}...`)
    ))
    server.timeout = 0
    server.keepAliveTimeout = 0
    server.headersTimeout = 0
})()