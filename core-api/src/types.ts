import { StringKeyMap } from '../../shared'
export { StringKeyMap }

export interface ValidatedPayload<T> {
    isValid: boolean
    payload?: T
    error?: string 
}