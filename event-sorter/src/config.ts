import { ev, config, StringKeyMap } from '../../shared'

const eventSorterConfig: StringKeyMap = {
    ...config,
    WARN_AT_GAP_SIZE: Number(ev('WARN_AT_GAP_SIZE', 10)),
}

export default eventSorterConfig