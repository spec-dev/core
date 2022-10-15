import { ev, config, StringKeyMap } from '../../shared'

const abiTrackerConfig: StringKeyMap = {
    ...config,
    ETHERSCAN_API_KEY: ev('ETHERSCAN_API_KEY'),
    POLL_FRONT_PAGE_INTERVAL: 60000,
}

export default abiTrackerConfig