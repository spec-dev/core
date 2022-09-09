import { StringKeyMap } from '../../shared/src'
export { StringKeyMap }

export interface ValidatedPayload<T> {
    isValid: boolean
    payload?: T
    error?: string 
}