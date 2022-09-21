import { StringKeyMap } from '../../lib/types'

export function toNonEmptyArray(val: any): any[] | null {
    if (Array.isArray(val)) {
        return val.length ? val : null
    }
    return val === undefined || val === null ? null : [val]
}

export function keysAsNonEmptyArrays(obj: StringKeyMap): StringKeyMap {
    if (!obj || obj === [] || obj === {}) return {}
    const m = {}
    for (const key in obj) {
        m[key] = toNonEmptyArray(obj[key])
    }
    return m
}

export function preventEmptyQuery(obj: StringKeyMap, res): boolean {
    const presentValues = Object.values(obj).filter(v => v !== null)
    if (!presentValues.length) {
        res.write(new TextEncoder().encode('[]'))
        res.end()
        return true
    }
    return false
}