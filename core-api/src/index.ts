import sccBrokerClient from 'scc-broker-client'
import config from './config'
import { logger, CoreDB } from '../../shared'
import { app as expressApp } from './routes'
import { agServer, httpServer } from './server'

const coreDBPromise = CoreDB.initialize()

// Prevent all broad publishes.
agServer.setMiddleware(agServer.MIDDLEWARE_INBOUND, async stream => {
    for await (let action of stream) {
        if (action.type === action.PUBLISH_IN) {
            const publishError = new Error('You are not authorized to publish events.')
            publishError.name = 'PublishError'
            action.block(publishError)
            continue
        }

        // Any unhandled case will be allowed by default.
        action.allow()
    }
})

// Pipe HTTP requests to express.
;(async () => {
    for await (let requestData of httpServer.listener('request')) {
        expressApp.apply(null, requestData)
    }
})()

// SocketCluster/WebSocket connection handling loop.
;(async () => {
    await coreDBPromise
    
    for await (let {socket} of agServer.listener('connection')) {
        // ;(async () => {
        //     // RPC - Resolve the given live objects.
        //     for await (let request of socket.procedure(RPC.ResolveLiveObjects)) {
        //         resolveLiveObjectVersions(request)
        //     }
        // })()
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

// Log warnings.
if (config.SOCKETCLUSTER_LOG_LEVEL >= 2) {
    logger.info(`[${config.SCC_INSTANCE_ID}]: SocketCluster listening on port ${config.SOCKETCLUSTER_PORT}...`)
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