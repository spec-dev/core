import { ev, config, StringKeyMap } from '../../shared'

const abiTrackerConfig: StringKeyMap = {
    ...config,
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
    POLL_FRONT_PAGE_INTERVAL: 60000,
    CORE_API_ORIGIN: ev('CORE_API_ORIGIN', 'https://api.spec.dev'),
    CORE_API_ADMIN_TOKEN: ev('CORE_API_ADMIN_TOKEN'),
    ADMIN_AUTH_HEADER_NAME: 'Spec-Admin-Auth-Token',
}

export default abiTrackerConfig