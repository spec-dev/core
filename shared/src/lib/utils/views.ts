const BACKUP_CONTRACT_EVENT_VIEW_PREFIX = 'contract_event'

export const formatBackupContractEventViewName = (eventUid: string): string =>
    [BACKUP_CONTRACT_EVENT_VIEW_PREFIX, eventUid].join('_').replace(/-/gi, '')
