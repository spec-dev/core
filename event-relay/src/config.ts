import { ev, config, StringKeyMap } from '../../shared'
import uuid4 from 'uuid4'

const numberOrNull = (val: any): number | null => Number.isNaN(val) ? null : val

const eventRelayConfig: StringKeyMap = {
    ...config,

    // SocketCluster 
    SOCKETCLUSTER_PORT: Number(ev('SOCKETCLUSTER_PORT', 8888)),
    SOCKETCLUSTER_WS_ENGINE: ev('SOCKETCLUSTER_WS_ENGINE', 'ws'),
    SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT: Number(ev('SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT', 1000)),
    SOCKETCLUSTER_LOG_LEVEL: Number(ev('SOCKETCLUSTER_LOG_LEVEL', 2)),
    SOCKETCLUSTER_OPTIONS: ev('SOCKETCLUSTER_OPTIONS'),

    // SCC
    SCC_INSTANCE_ID: uuid4(),
    SCC_STATE_SERVER_HOST: ev('SCC_STATE_SERVER_HOST'),
    SCC_STATE_SERVER_PORT: Number(ev('SCC_STATE_SERVER_PORT', 7777)),
    SCC_MAPPING_ENGINE: ev('SCC_MAPPING_ENGINE'),
    SCC_CLIENT_POOL_SIZE: ev('SCC_CLIENT_POOL_SIZE'),
    SCC_AUTH_KEY: ev('SCC_AUTH_KEY'),
    SCC_INSTANCE_IP: ev('SCC_INSTANCE_IP'),
    SCC_INSTANCE_IP_FAMILY: ev('SCC_INSTANCE_IP_FAMILY'),
    SCC_STATE_SERVER_CONNECT_TIMEOUT: numberOrNull(Number(ev('SCC_STATE_SERVER_CONNECT_TIMEOUT'))),
    SCC_STATE_SERVER_ACK_TIMEOUT: numberOrNull(Number(ev('SCC_STATE_SERVER_ACK_TIMEOUT'))),
    SCC_STATE_SERVER_RECONNECT_RANDOMNESS: numberOrNull(Number(ev('SCC_STATE_SERVER_RECONNECT_RANDOMNESS'))),
    SCC_PUB_SUB_BATCH_DURATION: numberOrNull(Number(ev('SCC_PUB_SUB_BATCH_DURATION'))),
    SCC_BROKER_RETRY_DELAY: numberOrNull(Number(ev('SCC_BROKER_RETRY_DELAY'))),
    USE_SCC_CLUSTER: ['true', true].includes(ev('USE_SCC_CLUSTER')),

    // Missed event retrieval batch size.
    FETCHING_MISSED_EVENTS_BATCH_SIZE: Number(ev('FETCHING_MISSED_EVENTS_BATCH_SIZE', 100)),
    
}

export default eventRelayConfig