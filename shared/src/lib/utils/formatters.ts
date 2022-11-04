import { numberToHex as nth, hexToNumber as htn, hexToNumberString as htns } from 'web3-utils'
import { StringKeyMap } from '../types'

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const NULL_32_BYTE_HASH =
    '0x0000000000000000000000000000000000000000000000000000000000000000'
export const NULL_BYTE_DATE = '0x'

const ABI_INPUT_PLACEHOLDER_PREFIX = '___ph-'

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
    const atSplit = (namespacedVersion || '').split('@')
    if (atSplit.length !== 2) {
        return { nsp: '', name: '', version: '' }
    }
    const [nspName, version] = atSplit
    const dotSplit = (nspName || '').split('.')
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

export const toChunks = (arr: any[], chunkSize: number): any[][] => {
    const result = []
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize)
        result.push(chunk)
    }
    return result
}

export const formatAbiValueWithType = (value: any, dataType: string): any => {
    if (dataType?.includes('int')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return attemptToParseNumber(value)
    }
    if (dataType?.includes('address')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return attemptToLowerCase(value)
    }
    if (dataType?.includes('bool')) {
        if (dataType.match(/\[.*\]$/) !== null) {
            return Array.isArray(value)
                ? value.map((v) =>
                      formatAbiValueWithType(v, dataType.slice(0, dataType.length - 2))
                  )
                : value
        }
        return parseAbiBool(value)
    }
    return value
}

export const attemptToParseNumber = (originalValue: any): any => {
    try {
        const numberValue = Number(originalValue)
        return numberValue > Number.MAX_SAFE_INTEGER ? originalValue : numberValue
    } catch (err) {
        return originalValue
    }
}

export const attemptToLowerCase = (originalValue: string): string => {
    try {
        return originalValue.toLowerCase()
    } catch (err) {
        return originalValue
    }
}

export const parseAbiBool = (value: any): boolean => {
    if (!value) return false
    switch (typeof value) {
        case 'string':
            return value.includes('true') || parseInt(value) === 1
        case 'number':
            return value === 1
        default:
            return value
    }
}

export const functionSignatureToAbiInputs = (value: string): StringKeyMap => {
    const [functionName, _] = value.split('(')
    const inputs = (groupArgs(value.replace(/,/g, ' '))[0] || {}).components || []
    return { functionName, inputs }
}

export const minimizeAbiInputs = (inputs: StringKeyMap[]): StringKeyMap[] => {
    return inputs
        .map((input) => {
            if (Array.isArray(input)) {
                return minimizeAbiInputs(input).filter((v) => !!v)
            } else if (typeof input === 'object' && input?.type) {
                const minInput: any = { type: input.type }
                if (input.hasOwnProperty('components')) {
                    minInput.components = minimizeAbiInputs(input.components || [])
                }
                return minInput
            } else {
                return null
            }
        })
        .filter((v) => !!v)
}

export const ensureNamesExistOnAbiInputs = (inputs: StringKeyMap[]): any => {
    return inputs.map((input) => {
        if (Array.isArray(input)) {
            return ensureNamesExistOnAbiInputs(input)
        } else if (typeof input === 'object' && input?.type) {
            if (!input.name) {
                input.name = `${ABI_INPUT_PLACEHOLDER_PREFIX}${parseInt(
                    (Math.random() * 1000000000) as any
                )}`
            }
            if (input.hasOwnProperty('components')) {
                input.components = ensureNamesExistOnAbiInputs(input.components || [])
            }
            return input
        } else {
            return input
        }
    })
}

export const groupAbiInputsWithValues = (inputs: StringKeyMap[], values: any): StringKeyMap[] => {
    return inputs.map((input, i) => {
        if (Array.isArray(input)) {
            return groupAbiInputsWithValues(input, values[i])
        } else if (typeof input === 'object' && input?.type) {
            let newInput = { ...input }
            if (newInput.hasOwnProperty('components')) {
                if (newInput.type?.match(/\[.*\]$/) !== null) {
                    newInput.value = (values[i] || []).map((valGroup) =>
                        groupAbiInputsWithValues(newInput.components || [], valGroup)
                    )
                } else {
                    newInput.value = groupAbiInputsWithValues(newInput.components || [], values[i])
                }
                delete newInput.components
            } else {
                newInput.value = formatAbiValueWithType(values[i], newInput.type)
            }
            if (newInput.name && newInput.name.startsWith(ABI_INPUT_PLACEHOLDER_PREFIX)) {
                delete newInput.name
            }
            Object.keys(newInput)
                .filter((k) => !['name', 'type', 'value'].includes(k))
                .forEach((k) => {
                    delete newInput[k]
                })
            return newInput
        } else {
            return input
        }
    })
}

const groupArgs = (value: string): any => {
    var i = 0
    function recurse() {
        var arr = []
        var startIndex = i
        function addWord() {
            if (i - 1 > startIndex) {
                arr.push({ type: value.slice(startIndex, i - 1) })
            }
        }
        while (i < value.length) {
            switch (value[i++]) {
                case ' ':
                    addWord()
                    startIndex = i
                    continue
                case '(':
                    arr.push(recurse())
                    startIndex = i
                    continue
                case ')':
                    addWord()
                    let type = 'tuple'
                    if (value[i] === '[' && value[i + 1] === ']') {
                        i += 2
                        type += '[]'
                    }
                    return { type, components: arr }
            }
        }
        addWord()
        return arr
    }
    return recurse()
}
