import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

export function toUTCDate(value: string): dayjs.Dayjs {
    return dayjs.utc(value)
}