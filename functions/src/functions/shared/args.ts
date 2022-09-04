import { StringKeyMap } from '../../lib/types'

export function toArray(value: any): any[] | undefined {
    if (value === undefined) return undefined
    return Array.isArray(value) ? value : [value]
}

export function withArrayKeys(input: StringKeyMap): StringKeyMap {
    const m: StringKeyMap = {}
    for (let key in input) {
        m[key] = toArray(input[key])
    }
    return m
}