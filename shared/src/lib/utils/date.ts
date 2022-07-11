export const unixTimestampToDate = (ts: number | string): Date => new Date(Number(ts) * 1000)
