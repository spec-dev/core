import http from 'http'
import eetase from 'eetase'
import express from 'express'
import morgan from 'morgan'
import socketClusterServer from 'socketcluster-server'
import sccBrokerClient from 'scc-broker-client'
import config from './config'
import { specEnvs, logger, ClaimRole, CoreDB } from '../../shared'
import { resolveLiveObjectVersions, getEventsAfterCursors, RPC } from './rpcs'
import { authConnection } from './utils/auth'

const coreDBPromise = CoreDB.initialize()

// Create SocketCluster server options.
const agOptions = {
    authKey: config.JWT_SECRET,
}
if (config.SOCKETCLUSTER_OPTIONS) {
    Object.assign(agOptions, JSON.parse(config.SOCKETCLUSTER_OPTIONS))
}

// Create HTTP + SocketCluster server.
const httpServer = eetase(http.createServer())
const agServer = socketClusterServer.attach(httpServer, agOptions)

// Secure actions.
agServer.setMiddleware(agServer.MIDDLEWARE_INBOUND, async stream => {
    for await (let action of stream) { 
        // Auth new connections.
        if (action.type === action.AUTHENTICATE) {
            const authToken = action.socket.authToken

            if (!authToken || !(await authConnection(authToken))) {
                const authError = new Error('Unauthorized')
                authError.name = 'AuthError'
                action.block(authError)
                continue
            }
        }

        // Secure who can publish.
        if (action.type === action.PUBLISH_IN) {
            const authToken = action.socket.authToken

            // Must be an event publisher.
            if (!authToken || authToken.role !== ClaimRole.EventPublisher) {
                const publishError = new Error('You are not authorized to publish events.')
                publishError.name = 'PublishError'
                action.block(publishError)
                continue
            }
        }

        action.allow()
    }
})
  
// Create Express app.
const expressApp = express()
if (config.ENV !== specEnvs.PROD) {
    expressApp.use(morgan('dev'))
}

// Health check route.
expressApp.get('/health-check', (_, res) => res.sendStatus(200))

// Pipe HTTP requests to express.
;(async () => {
    for await (let requestData of httpServer.listener('request')) {
        expressApp.apply(null, requestData)
    }
})()

const pub = async (channel, data) => await agServer.exchange.invokePublish(channel, data)

// SocketCluster/WebSocket connection handling loop.
;(async () => {
    await coreDBPromise

    for await (let {socket} of agServer.listener('connection')) {
        ;(async () => {
            // RPC - Resolve the given live objects.
            for await (let request of socket.procedure(RPC.ResolveLiveObjects)) {
                resolveLiveObjectVersions(request)
            }
        })()
        ;(async () => {
            // RPC - Get events that occurred after the given event cursors.
            for await (let request of socket.procedure(RPC.GetEventsAfterCursors)) {
                getEventsAfterCursors(request, pub)
            }
        })()
        ;(async () => {
            // RPC - Ping / Pong.
            for await (let request of socket.procedure(RPC.Ping)) {
                request.end({ pong: true })
            }
        })()
    }
})()

httpServer.listen(config.SOCKETCLUSTER_PORT)

// Log errors.
if (config.SOCKETCLUSTER_LOG_LEVEL >= 1) {
    ;(async () => {
        for await (let { error } of agServer.listener('error')) {
            logger.error(`AGServer Error - ${error}`)
        }
    })()
}

logger.info(`[${config.SCC_INSTANCE_ID}]: SocketCluster listening on port ${config.SOCKETCLUSTER_PORT}...`)

// Log warnings.
if (config.SOCKETCLUSTER_LOG_LEVEL >= 2) {
    ;(async () => {
        for await (let { warning } of agServer.listener('warning')) {
            logger.error(`AGServer Warning - ${warning}`)
        }
    })()
}

// Setup broker client to connect to SCC.
if (config.SCC_STATE_SERVER_HOST) {
    const sccClient = sccBrokerClient.attach(agServer.brokerEngine, {
        instanceId: config.SCC_INSTANCE_ID,
        instancePort: config.SOCKETCLUSTER_PORT,
        instanceIp: config.SCC_INSTANCE_IP,
        instanceIpFamily: config.SCC_INSTANCE_IP_FAMILY,
        pubSubBatchDuration: config.SCC_PUB_SUB_BATCH_DURATION,
        stateServerHost: config.SCC_STATE_SERVER_HOST,
        stateServerPort: config.SCC_STATE_SERVER_PORT,
        mappingEngine: config.SCC_MAPPING_ENGINE,
        clientPoolSize: config.SCC_CLIENT_POOL_SIZE,
        authKey: config.SCC_AUTH_KEY,
        stateServerConnectTimeout: config.SCC_STATE_SERVER_CONNECT_TIMEOUT,
        stateServerAckTimeout: config.SCC_STATE_SERVER_ACK_TIMEOUT,
        stateServerReconnectRandomness: config.SCC_STATE_SERVER_RECONNECT_RANDOMNESS,
        brokerRetryDelay: config.SCC_BROKER_RETRY_DELAY
    })

    if (config.SOCKETCLUSTER_LOG_LEVEL >= 1) {
        ;(async () => {
            for await (let { error } of sccClient.listener('error')) {
                error.name = 'SCCError'
                logger.error(`SCC Error - ${error}`)
            }
        })()
    }
}