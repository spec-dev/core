const prefix = {
    USER: '/user',
    PROJECT: '/project',
    DEPLOYMENT: '/deployment',
    ADMIN: '/admin',
    LIVE_OBJECT: '/live-object',
    LIVE_OBJECT_VERSION: '/live-object-version',
    CONTRACT_INSTANCE: '/contract-instance',
    CONTRACT_REGISTRATION_JOB: '/contract-registration-job',
    PUBLISH_LIVE_OBJECT_VERSION_JOB: '/publish-live-object-version-job',
    EVENT_VERSION: '/event-version',
    CALL_VERSION: '/call-version',
    PIPELINE: '/pipeline',
    CONTRACT: '/contract',
    NAMESPACE: '/namespace',
    EVENT: '/event',
}

const paths = {
    // General paths
    HEALTH_CHECK: '/health-check',

    // User paths
    USER_LOGIN: prefix.USER + '/login',
    USER_PROJECTS: prefix.USER + '/projects',

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
    LIVE_OBJECT_PAGE: prefix.LIVE_OBJECT + '/page',

    // Live Object Version paths.
    ADMIN_PUBLISH_LIVE_OBJECT_VERSION: prefix.ADMIN + prefix.LIVE_OBJECT_VERSION + '/publish',
    INDEX_LIVE_OBJECT_VERSIONS: prefix.ADMIN + prefix.LIVE_OBJECT_VERSION + 's' + '/index',
    GENERATE_LOV_TEST_INPUT_DATA: prefix.LIVE_OBJECT_VERSION + '/generate-test-inputs',
    PUBLISH_LIVE_OBJECT_VERSION: prefix.LIVE_OBJECT_VERSION + '/publish',
    LATEST_LOV_RECORDS: prefix.LIVE_OBJECT_VERSION + '/latest-records',
    LIVE_OBJECT_VERSION: prefix.LIVE_OBJECT_VERSION,
    LOV_RECORD_COUNTS: prefix.LIVE_OBJECT_VERSION + 's' + '/record-counts',

    // Contract Instance paths.
    NEW_CONTRACT_INSTANCES: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's',
    DECODE_CONTRACT_INTERACTIONS: prefix.ADMIN + prefix.CONTRACT_INSTANCE + 's' + '/decode',
    REGISTER_CONTRACT_INSTANCES: prefix.CONTRACT_INSTANCE + 's' + '/register',
    CONTRACT_INSTANCES: prefix.CONTRACT_INSTANCE,

    // Contract paths.
    CONTRACT_GROUP: prefix.CONTRACT + '/group',
    CONTRACT_GROUPS: prefix.CONTRACT + '/group' + 's',
    CONTRACT_GROUP_EVENTS: prefix.CONTRACT + '/group' + '/events',
    CONTRACT_GROUP_PAGE: prefix.CONTRACT + '/group/page',
    RESET_CONTRACT_GROUP_RECORD_COUNTS: prefix.ADMIN + prefix.CONTRACT + '/group/recount-records',
    RESET_CONTRACT_GROUP_EVENT_START_BLOCKS: prefix.ADMIN + prefix.CONTRACT + '/group/reset-event-start-blocks',
    ADD_CONTRACTS_TO_GROUP: prefix.CONTRACT + '/group/add',

    // Contract Registration Job paths.
    CONTRACT_REGISTRATION_JOB: prefix.CONTRACT_REGISTRATION_JOB,

    // Live Object Version Job paths.
    PUBLISH_LIVE_OBJECT_VERSION_JOB: prefix.PUBLISH_LIVE_OBJECT_VERSION_JOB,

    // Event Version paths.
    RESOLVE_EVENT_VERSIONS: prefix.EVENT_VERSION + 's' + '/resolve',
    EVENT_VERSIONS: prefix.EVENT_VERSION + 's',
    RESOLVE_EVENT_VERSION_CURSORS: prefix.EVENT_VERSION + 's' + '/resolve/cursors',
    GET_EVENT_VERSION_DATA_AFTER: prefix.EVENT_VERSION + 's' + '/data/after',

    // Event paths.
    EVENTS: prefix.EVENT + 's',

    // Call Version paths.
    RESOLVE_CALL_VERSIONS: prefix.CALL_VERSION + 's' + '/resolve',

    // Pipeline config paths.
    TOGGLE_PROCESS_JOBS: prefix.ADMIN + prefix.PIPELINE + '/toggle-process-jobs',
    GET_PROCESS_JOBS_STATUS: prefix.ADMIN + prefix.PIPELINE + '/process-jobs',
    SERIES_NUMBER: prefix.ADMIN + prefix.PIPELINE + '/series-number',
    BLOCK_OPS_CEILING: prefix.ADMIN + prefix.PIPELINE + '/block-ops-ceiling',
    LOV_FAILURE: prefix.ADMIN + prefix.PIPELINE + '/lov-failure',
    ENQUEUE_BLOCK: prefix.ADMIN + prefix.PIPELINE + '/enqueue-block',

    // Namespace paths.
    NAMESPACE: prefix.NAMESPACE,
    NAMESPACES: prefix.NAMESPACE + 's',
    FEATURED_NAMESPACES: prefix.NAMESPACE + 's' + '/featured',
    CACHE_FEATURED_NAMESPACES: prefix.ADMIN + prefix.NAMESPACE + 's' + '/featured',
    NAMESPACE_RECORD_COUNTS: prefix.NAMESPACE + 's' + '/record-counts',
}

export default paths
