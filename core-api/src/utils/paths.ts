const prefix = {
    USER: '/user',
    PROJECT: '/project',
    DEPLOYMENT: '/deployment',
    ADMIN: '/admin',
    LIVE_OBJECT: '/live-object',
    LIVE_OBJECT_VERSION: '/live-object-version',
    CONTRACT_INSTANCE: '/contract-instance',
}

const paths = {
    // General paths
    HEALTH_CHECK: '/health-check',

    // User paths
    USER_LOGIN: prefix.USER + '/login',

    // Project paths.
    PROJECT_WITH_KEY: prefix.PROJECT + '/with-key',
    PROJECT_LOGS: prefix.PROJECT + '/logs',

    // Deployment paths.
    NEW_DEPLOYMENT: prefix.DEPLOYMENT,

    // ABI paths.
    UPSERT_ABIS: prefix.ADMIN + '/abis',

    // Live Object paths.
    LIVE_OBJECTS: prefix.LIVE_OBJECT + 's',

    // Live Object Version paths.
    PUBLISH_LIVE_OBJECT_VERSION: prefix.ADMIN + prefix.LIVE_OBJECT_VERSION + '/publish',

    // Contract Instance paths.
    NEW_CONTRACT_INSTANCES: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's',
    DECODE_CONTRACT_INTERACTIONS: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's' + '/decode',
}

export default paths
