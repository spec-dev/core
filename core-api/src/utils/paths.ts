const prefix = {
    USER: '/user',
    PROJECT: '/project',
    DEPLOYMENT: '/deployment',
    ADMIN: '/admin',
    LIVE_OBJECT: '/live-object',
    LIVE_OBJECT_VERSION: '/live-object-version',
    CONTRACT_INSTANCE: '/contract-instance',
    CONTRACT_REGISTRATION_JOB: '/contract-registration-job',
    EVENT_VERSION: '/event-version',
    CALL_VERSION: '/call-version',
    PIPELINE: '/pipeline',
    CONTRACT: '/contract',
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
    ADMIN_ABI: prefix.ADMIN + '/abi',
    ADMIN_ABIS: prefix.ADMIN + '/abis',
    ABI: '/abi',

    // Live Object paths.
    LIVE_OBJECTS: prefix.LIVE_OBJECT + 's',
    LIVE_OBJECTS_SEARCH: prefix.LIVE_OBJECT + 's' + '/search',

    // Live Object Version paths.
    PUBLISH_LIVE_OBJECT_VERSION: prefix.ADMIN + prefix.LIVE_OBJECT_VERSION + '/publish',
    INDEX_LIVE_OBJECT_VERSIONS: prefix.ADMIN + prefix.LIVE_OBJECT_VERSION + 's' + '/index',
    GENERATE_LOV_TEST_INPUT_DATA: prefix.LIVE_OBJECT_VERSION + '/generate-test-inputs',

    // Contract Instance paths.
    NEW_CONTRACT_INSTANCES: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's',
    DECODE_CONTRACT_INTERACTIONS: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's' + '/decode',
    REGISTER_CONTRACT_INSTANCES: prefix.CONTRACT_INSTANCE + 's' + '/register',
    CONTRACT_INSTANCES: prefix.CONTRACT_INSTANCE,

    // Contract paths.
    CONTRACT_GROUP: prefix.CONTRACT + '/group',

    // Contract Registration Job paths.
    CONTRACT_REGISTRATION_JOB: prefix.CONTRACT_REGISTRATION_JOB,

    // Event Version paths.
    RESOLVE_EVENT_VERSIONS: prefix.EVENT_VERSION + 's' + '/resolve',

    // Call Version paths.
    RESOLVE_CALL_VERSIONS: prefix.CALL_VERSION + 's' + '/resolve',

    // Pipeline config paths.
    TOGGLE_PROCESS_JOBS: prefix.ADMIN + prefix.PIPELINE + '/toggle-process-jobs',
    GET_PROCESS_JOBS_STATUS: prefix.ADMIN + prefix.PIPELINE + '/process-jobs',
    SERIES_NUMBER: prefix.ADMIN + prefix.PIPELINE + '/series-number',
    BLOCK_OPS_CEILING: prefix.ADMIN + prefix.PIPELINE + '/block-ops-ceiling',
    LOV_FAILURE: prefix.ADMIN + prefix.PIPELINE + '/lov-failure',
    ENQUEUE_BLOCK: prefix.ADMIN + prefix.PIPELINE + '/enqueue-block',
}

export default paths
