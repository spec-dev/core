import { StringKeyMap } from '../../lib/types'

export function toNonEmptyArray(val: any): any[] | null {
    if (Array.isArray(val)) {
        return val.length ? val : null
    }
    return val === undefined || val === null ? null : [val]
}

export function keysAsNonEmptyArrays(obj: StringKeyMap): StringKeyMap {
    const m = {}
    for (const key in obj) {
        m[key] = toNonEmptyArray(obj[key])
    }
    return m
}