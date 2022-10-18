export type StringKeyMap = { [key: string]: any }

export type StringMap = { [key: string]: string }

export type AnyMap = { [key: string | number]: any }

export interface SpecApiResponse {
    data?: StringKeyMap
    error?: string
    headers?: any
}