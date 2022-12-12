import { ev, config, StringKeyMap } from '../../shared'

const gapDetectorConfig: StringKeyMap = {
    ...config,
    NEW_BLOCK_CHANNEL_PREFIX: 'new_block_chain_',
    ETHEREUM_HEAD_REPORTER_QUEUE_KEY: ev('ETHEREUM_HEAD_REPORTER_QUEUE_KEY'),
    POLYGON_HEAD_REPORTER_QUEUE_KEY: ev('POLYGON_HEAD_REPORTER_QUEUE_KEY'),
    MUMBAI_HEAD_REPORTER_QUEUE_KEY: ev('MUMBAI_HEAD_REPORTER_QUEUE_KEY'),
}

export default gapDetectorConfig