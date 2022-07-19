import { validate } from 'compare-versions'

export function isValidVersionFormat(version: string): boolean {
    return validate(version)
}