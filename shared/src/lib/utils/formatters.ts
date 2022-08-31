import { numberToHex as nth, hexToNumber as htn, hexToNumberString as htns } from 'web3-utils'
import { StringKeyMap } from '../types'

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const NULL_32_BYTE_HASH =
    '0x0000000000000000000000000000000000000000000000000000000000000000'
export const NULL_BYTE_DATE = '0x'

export const mapByKey = (iterable: object[], key: string): { [key: string]: any } => {
    let m = {}
    let val
    for (let i = 0; i < iterable.length; i++) {
        val = iterable[i][key]
        m[val] = iterable[i]
    }
    return m
}

export const normalizeEthAddress = (
    value: any,
    replaceNullAddress: boolean = true
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if (value === NULL_ADDRESS && replaceNullAddress) {
        return null
    } else {
        return value.toLowerCase()
    }
}

export const normalize32ByteHash = (
    value: any,
    replaceNullAddress: boolean = true
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if ((value === NULL_32_BYTE_HASH || value === NULL_BYTE_DATE) && replaceNullAddress) {
        return null
    } else {
        return value
    }
}

export const normalizeByteData = (
    value: any,
    replaceNullAddress: boolean = true
): string | null => {
    if (typeof value !== 'string') {
        return null
    } else if (value === NULL_BYTE_DATE && replaceNullAddress) {
        return null
    } else {
        return value
    }
}

export const numberToHex = (value: any): string | null => {
    if (typeof value !== 'number' && typeof value !== 'bigint') {
        return null
    }

    return nth(value as any)
}

export const hexToNumber = (value: any): number | null => {
    if (typeof value !== 'string') {
        return null
    }
    return htn(value)
}

export const hexToNumberString = (value: any): string | null => {
    if (typeof value !== 'string') {
        return null
    }
    return htns(value)
}

export const toString = (value: any): string => {
    if (value === null || value === undefined) {
        return ''
    }
    return value.toString()
}

export const toSlug = (value: string): string => {
    return value
        .replace(/[']/g, '')
        .replace(/[^A-Za-z0-9-_]/g, '-')
        .toLowerCase()
}

export const toNamespacedVersion = (nsp: string, name: string, version: string) =>
    `${nsp}.${name}@${version}`

export const fromNamespacedVersion = (
    namespacedVersion: string
): { nsp: string; name: string; version: string } => {
    const atSplit = namespacedVersion.split('@')
    if (atSplit.length !== 2) {
        return { nsp: '', name: '', version: '' }
    }
    const [nspName, version] = atSplit
    const dotSplit = nspName.split('.')
    if (dotSplit.length !== 2) {
        return { nsp: '', name: '', version: '' }
    }
    const [nsp, name] = dotSplit
    return { nsp, name, version }
}

export const uniqueByKeys = (iterable: StringKeyMap[], keys: string[]): StringKeyMap[] => {
    const uniqueArr = []
    const keysSeen = new Set<string>()
    for (let i = 0; i < iterable.length; i++) {
        const obj = iterable[i]
        const uniqueKeyId = keys.map((key) => obj[key] || '').join('__')
        if (keysSeen.has(uniqueKeyId)) continue
        keysSeen.add(uniqueKeyId)
        uniqueArr.push(obj)
    }
    return uniqueArr
}
