import { numberToHex as nth, hexToNumber as htn } from 'web3-utils'

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
    } else if (value === NULL_32_BYTE_HASH && replaceNullAddress) {
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

export const toString = (value: any): string => {
    if (value === null || value === undefined) {
        return ''
    }
    return value.toString()
}
