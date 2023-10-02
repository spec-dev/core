import { ev, config, StringKeyMap } from '../../shared'

const gapDetectorConfig: StringKeyMap = {
    ...config,
    NEW_BLOCK_CHANNEL_PREFIX: 'new_block_chain_',
    ETHEREUM_HEAD_REPORTER_QUEUE_KEY: ev('ETHEREUM_HEAD_REPORTER_QUEUE_KEY'),
    GOERLI_HEAD_REPORTER_QUEUE_KEY: ev('GOERLI_HEAD_REPORTER_QUEUE_KEY'),
    POLYGON_HEAD_REPORTER_QUEUE_KEY: ev('POLYGON_HEAD_REPORTER_QUEUE_KEY'),
    MUMBAI_HEAD_REPORTER_QUEUE_KEY: ev('MUMBAI_HEAD_REPORTER_QUEUE_KEY'),
    BASE_HEAD_REPORTER_QUEUE_KEY: ev('BASE_HEAD_REPORTER_QUEUE_KEY'),
    SERIES_GEN_NUMBER_RANGE: Number(ev('SERIES_GEN_NUMBER_RANGE', 200)),
    CHECK_IN_TOLERANCE: Number(ev('CHECK_IN_TOLERANCE', 10)), // blocks
    GAP_TOLERANCE: Number(ev('GAP_TOLERANCE', 10)), // blocks
    SERIES_GEN_INTERVAL: Number(ev('SERIES_GEN_INTERVAL', 20000)),
    MONITOR_REQUEUED_BLOCKS_INTERVAL: Number(ev('MONITOR_REQUEUED_BLOCKS_INTERVAL', 20000)),
}

export default gapDetectorConfig