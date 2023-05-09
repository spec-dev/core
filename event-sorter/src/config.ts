import { ev, config, StringKeyMap } from '../../shared'

const eventSorterConfig: StringKeyMap = {
    ...config,
    CHAIN_ID: ev('CHAIN_ID'),
    WARN_AT_GAP_SIZE: Number(ev('WARN_AT_GAP_SIZE', 20)),
}

export default eventSorterConfig