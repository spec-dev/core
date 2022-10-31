export const unixTimestampToDate = (ts: number | string): Date => new Date(Number(ts) * 1000)

export const nowAsUTCDateString = (): string => new Date(new Date().toUTCString()).toISOString()
