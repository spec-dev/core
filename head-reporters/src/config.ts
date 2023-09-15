import { ev, config, StringKeyMap } from '../../shared'

const forceUncleRange = (ev('FORCE_UNCLE_RANGE') || '')
    .split(',').map(v => v.trim()).filter(v => v!!).map(v => parseInt(v)).sort((a, b) => a - b)

let rollbackTarget = ev('ROLLBACK_TARGET')
rollbackTarget = rollbackTarget ? parseInt(rollbackTarget) : null
rollbackTarget = rollbackTarget !== null && !Number.isNaN(rollbackTarget) ? rollbackTarget : null

const hrConfig: StringKeyMap = {
    ...config,
    ALCHEMY_SUBSCRIPTION_URL: ev('ALCHEMY_SUBSCRIPTION_URL'),
    RPC_SUBSCRIPTION_URL: ev('RPC_SUBSCRIPTION_URL'),
    WS_PROVIDER_POOL: ev('WS_PROVIDER_POOL', ''),
    FORCE_REINDEX: [true, 'true'].includes(ev('FORCE_REINDEX', '').toLowerCase()),
    FORCE_UNCLE_RANGE: forceUncleRange,
    MAX_ATTEMPTS: 100,
    EXPO_BACKOFF_DELAY: 200,
    EXPO_BACKOFF_MAX_ATTEMPTS: 10,
    EXPO_BACKOFF_FACTOR: 1.5,
    MAX_REORG_SIZE: 10000,
    ROLLBACK_TABLE_PARALLEL_FACTOR: 10,
    UNCLE_PAUSE_TIME: 30000,
    UNCLE_PAUSE_TIME_IN_BLOCKS: 5,
    ROLLBACK_TABLE: ev('ROLLBACK_TABLE'),
    ROLLBACK_TARGET: rollbackTarget,
    FINALITY_SCAN_INTERVAL: Number(ev('FINALITY_SCAN_INTERVAL', 30000)),
    FINALITY_SCAN_OFFSET_LEFT: Number(ev('FINALITY_SCAN_OFFSET_LEFT', 100)),
    FINALITY_SCAN_OFFSET_RIGHT: Number(ev('FINALITY_SCAN_OFFSET_RIGHT', 16)),
    MAX_DEPTH_BEFORE_REORG_NOTIFICATION: Number(ev('MAX_DEPTH_BEFORE_REORG_NOTIFICATION', 50)),
    DROPPED_CONNECTION_CHECK_INTERVAL: 30000, // ms
    MAX_TIME_GAP_UNTIL_AUTO_RECONNECT: 180 // 3 min
}

export default hrConfig