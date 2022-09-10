import http from 'http'
import eetase from 'eetase'
import socketClusterServer from 'socketcluster-server'
import config from './config'
import { StringKeyMap } from './types'
import { logger } from '../../shared/src'

// Create SocketCluster server options.
const agOptions = {
    authKey: config.JWT_SECRET,
}
if (config.SOCKETCLUSTER_OPTIONS) {
    Object.assign(agOptions, JSON.parse(config.SOCKETCLUSTER_OPTIONS))
}

// Create HTTP + SocketCluster server.
export const httpServer = eetase(http.createServer())
export const agServer = socketClusterServer.attach(httpServer, agOptions)

export async function messageSpecInstance(channel: string, data: StringKeyMap) {
    try {
        await agServer.exchange.invokePublish(channel, data)
    } catch (err) {
        logger.error(`Error messaging spec instance on channel ${channel}: ${err}`)
        return false
    }
    return true
}