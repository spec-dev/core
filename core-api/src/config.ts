import { ev, config, StringKeyMap } from '../../shared'
import uuid4 from 'uuid4'

const coreApiConfig: StringKeyMap = {
    ...config,

    // SocketCluster
    SOCKETCLUSTER_PORT: Number(ev('CORE_SOCKETCLUSTER_PORT', 7777)),
    SOCKETCLUSTER_WS_ENGINE: ev('CORE_SOCKETCLUSTER_WS_ENGINE', 'ws'),
    SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT: Number(ev('CORE_SOCKETCLUSTER_SOCKET_CHANNEL_LIMIT', 1000)),
    SOCKETCLUSTER_LOG_LEVEL: Number(ev('CORE_SOCKETCLUSTER_LOG_LEVEL', 2)),
    SOCKETCLUSTER_OPTIONS: ev('CORE_SOCKETCLUSTER_OPTIONS'),

    // SCC
    SCC_INSTANCE_ID: uuid4(),
    SCC_STATE_SERVER_HOST: ev('CORE_SCC_STATE_SERVER_HOST'),
    SCC_STATE_SERVER_PORT: ev('CORE_SCC_STATE_SERVER_PORT'),
    SCC_MAPPING_ENGINE: ev('CORE_SCC_MAPPING_ENGINE'),
    SCC_CLIENT_POOL_SIZE: ev('CORE_SCC_CLIENT_POOL_SIZE'),
    SCC_AUTH_KEY: ev('CORE_SCC_AUTH_KEY'),
    SCC_INSTANCE_IP: ev('CORE_SCC_INSTANCE_IP'),
    SCC_INSTANCE_IP_FAMILY: ev('CORE_SCC_INSTANCE_IP_FAMILY'),
    SCC_STATE_SERVER_CONNECT_TIMEOUT: Number(ev('CORE_SCC_STATE_SERVER_CONNECT_TIMEOUT')),
    SCC_STATE_SERVER_ACK_TIMEOUT: Number(ev('CORE_SCC_STATE_SERVER_ACK_TIMEOUT')),
    SCC_STATE_SERVER_RECONNECT_RANDOMNESS: Number(ev('CORE_SCC_STATE_SERVER_RECONNECT_RANDOMNESS')),
    SCC_PUB_SUB_BATCH_DURATION: Number(ev('CORE_SCC_PUB_SUB_BATCH_DURATION')),
    SCC_BROKER_RETRY_DELAY: Number(ev('CORE_SCC_BROKER_RETRY_DELAY')),

    // Auth
    AUTH_HEADER_NAME: 'Spec-Auth-Token',
    USER_AUTH_HEADER_NAME: 'Spec-User-Auth-Token',
    ADMIN_AUTH_HEADER_NAME: 'Spec-Admin-Auth-Token',
    CORE_API_ADMIN_TOKEN: ev('CORE_API_ADMIN_TOKEN'),

    // Cloud file storage.
    AWS_ACCESS_KEY_ID: ev('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: ev('AWS_SECRET_ACCESS_KEY'),
    S3_BUCKET_NAME: ev('S3_BUCKET_NAME'),
    S3_REGION: ev('S3_REGION'),

    TRAILING_LOGS_BATCH_SIZE: 20,
    MAX_TRAILING_LOGS_BATCH_SIZE: 1000,

    TEST_DATA_BATCH_MAX_TIME: 5000, // ms
    TEST_DATA_BATCH_SIZE_SOFT_LIMIT: 10000, // records
    TEST_DATA_BLOCK_RANGE_SIZE: 1500, // blocks
}

export default coreApiConfig
