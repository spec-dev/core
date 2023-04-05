export const unixTimestampToDate = (ts: number | string): Date => new Date(Number(ts) * 1000)

export const nowAsUTCDateString = (): string => new Date(new Date().toUTCString()).toISOString()

export const addSeconds = (date: Date, seconds: number): Date => {
    const futureDate = new Date(date)
    futureDate.setSeconds(date.getSeconds() + seconds)
    return futureDate
}
