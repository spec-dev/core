import { ev, config, StringKeyMap } from '../../shared'

const manuallyReportNumbers = (ev('MANUALLY_REPORT_NUMBERS') || '')
    .split(',').map(v => v.trim()).filter(v => v!!).map(v => parseInt(v))

const hrConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: ev('CHAIN_ID'),
    ALCHEMY_SUBSCRIPTION_URL: ev('ALCHEMY_SUBSCRIPTION_URL'),
    HEAD_BUFFER: Number(ev('HEAD_BUFFER', 0)),
    MANUALLY_REPORT_NUMBERS: manuallyReportNumbers,
    FORCE_REINDEX: [true, 'true'].includes(ev('FORCE_REINDEX', '').toLowerCase()),
    INDEX_JOB_MAX_ATTEMPTS: Number(ev('INDEX_JOB_MAX_ATTEMPTS', 10)),
    MAX_ATTEMPTS: 100,
    EXPO_BACKOFF_DELAY: 200,
    EXPO_BACKOFF_MAX_ATTEMPTS: 10,
    EXPO_BACKOFF_FACTOR: 1.5,
    MAX_REORG_SIZE: 100,
    ROLLBACK_TABLE_PARALLEL_FACTOR: 10, 
    UNCLE_PAUSE_TIME: 60000,
    UNCLE_PAUSE_TIME_IN_BLOCKS: 10,
}

export default hrConfig