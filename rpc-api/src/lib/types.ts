export type StringKeyMap = { [key: string]: any }

export interface ValidatedPayload<T> {
    isValid: boolean
    payload?: T
    error?: string
}