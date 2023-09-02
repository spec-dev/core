import { validate, compareVersions } from 'compare-versions'

export const isNumber = (val: any): boolean => typeof val === 'number' && !Number.isNaN(val)

export const isValidVersionFormat = (version: string): boolean => validate(version)

export const isVersionGt = (v1: string, v2: string): boolean => compareVersions(v1, v2) === 1

export const isValidAddress = (address: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(address)

export const isValidContractGroup = (group: string): boolean => {
    const comps = (group || '').split('.').filter((v) => !!v)
    return comps.length === 2
}

export function couldBeEventName(value: string): boolean {
    value = value || ''
    if (value.includes('@')) {
        const splitValue = value.split('@')
        if (splitValue.length > 2) return false
        value = splitValue[0]
    }
    const sections = value.split('.').filter((v) => !!v)
    const numSections = sections.length
    return (
        numSections === 2 || numSections === 3 || (numSections === 5 && sections[1] === 'contracts')
    )
}

export const isDict = (val: any): boolean => !!val && typeof val === 'object' && !Array.isArray(val)
