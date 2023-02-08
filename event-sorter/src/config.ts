import { ev, config, StringKeyMap } from '../../shared'

const eventSorterConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: ev('CHAIN_ID'),
    MAX_LEADING_GAP_SIZE: Number(ev('MAX_LEADING_GAP_SIZE', 20)),
}

export default eventSorterConfig