import { padDateNumber } from './formatters'
import { subtractHours } from './date'

/*
    Timestamp at which...
    BEFORE this -> we have 5 min granularity of token prices
    AFTER this -> we have 1 min granularity of token prices
*/
const TOKEN_PRICE_INTERVAL_SWITCHPOINT = new Date('2023-03-21T03:03:00.000Z')

// Exact minute value at which token prices are timestamped.
const tokenPriceMinuteValues = [55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0]

export function formatPgDateString(d: Date, floorSeconds: boolean = true): string {
    const [year, month, date, hour, minutes] = [
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
    ]
    const seconds = floorSeconds ? '00' : padDateNumber(d.getUTCSeconds())
    const dateSection = [year, padDateNumber(month), padDateNumber(date)].join('-')
    const timeSection = [padDateNumber(hour), padDateNumber(minutes), seconds].join(':')
    return `${dateSection} ${timeSection}+00`
}

export function blockTimestampToTokenPriceTimestamp(blockTimestamp: Date): string {
    // Should have data for every minute if >= the switch point.
    if (blockTimestamp >= TOKEN_PRICE_INTERVAL_SWITCHPOINT) {
        return formatPgDateString(blockTimestamp)
    }

    // Find closest minute before the block timestamp from the tokenPriceMinuteValues.
    const blockTimestampMinutes = blockTimestamp.getUTCMinutes()
    const closestMinute = tokenPriceMinuteValues.find((minute) => minute <= blockTimestampMinutes)
    blockTimestamp.setUTCMinutes(closestMinute || 0)
    return formatPgDateString(blockTimestamp)
}

export async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
