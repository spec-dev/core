const prefix = {
    USER: '/user',
    PROJECT: '/project',
}

const paths = {
    // General paths
    HEALTH_CHECK: '/health-check',

    // User paths
    USER_LOGIN: prefix.USER + '/login',

    // Project paths.
    PROJECT_WITH_KEY: prefix.PROJECT + '/with-key',
}

export default paths