export const unixTimestampToDate = (ts: number | string): Date => new Date(Number(ts) * 1000)

export const dateToUnixTimestamp = (d: Date): number => Math.floor(d.getTime() / 1000)

export const currentUnixTs = (): number => Math.floor(Date.now() / 1000)
