export const unixTimestampToDate = (ts: number | string): Date => new Date(Number(ts) * 1000)

export const nowAsUTCDateString = (): string => new Date(new Date().toUTCString()).toISOString()

export const addSeconds = (date: Date, seconds: number): Date => {
    const futureDate = new Date(date)
    futureDate.setSeconds(date.getSeconds() + seconds)
    return futureDate
}

export const addMinutes = (date: Date, minutes: number): Date => {
    const prevDate = new Date(date)
    prevDate.setMinutes(date.getMinutes() + minutes)
    return prevDate
}

export const addHours = (date: Date, hours: number): Date => {
    const prevDate = new Date(date)
    prevDate.setHours(date.getHours() + hours)
    return prevDate
}

export const subtractHours = (date: Date, hours: number): Date => {
    const prevDate = new Date(date)
    prevDate.setHours(date.getHours() - hours)
    return prevDate
}
