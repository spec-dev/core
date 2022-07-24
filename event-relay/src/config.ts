import { ev, config } from 'shared'
import uuid4 from 'uuid4'

export default {
    // SocketCluster 
    SOCKETCLUSTER_PORT: Number(ev('SOCKETCLUSTER_PORT', 9000)),
    SOCKETCLUSTER_WS_ENGINE: ev('SOCKETCLUSTER_WS_ENGINE', 'ws'),
    SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT: Number(ev('SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT', 1000)),
    SOCKETCLUSTER_LOG_LEVEL: Number(ev('SOCKETCLUSTER_LOG_LEVEL', 2)),
    SOCKETCLUSTER_OPTIONS: ev('SOCKETCLUSTER_OPTIONS'),

    // SCC
    SCC_INSTANCE_ID: uuid4(),
    SCC_STATE_SERVER_HOST: ev('SCC_STATE_SERVER_HOST'),
    SCC_STATE_SERVER_PORT: ev('SCC_STATE_SERVER_PORT'),
    SCC_MAPPING_ENGINE: ev('SCC_MAPPING_ENGINE'),
    SCC_CLIENT_POOL_SIZE: ev('SCC_CLIENT_POOL_SIZE'),
    SCC_AUTH_KEY: ev('SCC_AUTH_KEY'),
    SCC_INSTANCE_IP: ev('SCC_INSTANCE_IP'),
    SCC_INSTANCE_IP_FAMILY: ev('SCC_INSTANCE_IP_FAMILY'),
    SCC_STATE_SERVER_CONNECT_TIMEOUT: Number(ev('SCC_STATE_SERVER_CONNECT_TIMEOUT')),
    SCC_STATE_SERVER_ACK_TIMEOUT: Number(ev('SCC_STATE_SERVER_ACK_TIMEOUT')),
    SCC_STATE_SERVER_RECONNECT_RANDOMNESS: Number(ev('SCC_STATE_SERVER_RECONNECT_RANDOMNESS')),
    SCC_PUB_SUB_BATCH_DURATION: Number(ev('SCC_PUB_SUB_BATCH_DURATION')),
    SCC_BROKER_RETRY_DELAY: Number(ev('SCC_BROKER_RETRY_DELAY')),

    ...config,
}